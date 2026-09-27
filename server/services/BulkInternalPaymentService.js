'use strict';

const supabase = require('../config/database');
const supabaseAdmin = require('../config/supabaseAdmin');
const FiatWalletService = require('./FiatWalletService');
const SystemState = require('../config/SystemState');
const logger = require('../utils/logger');
const realtime = require('./realtimeService');
const { createNotification } = require('./notificationService');
const { logAdminAction } = require('../controllers/adminController');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// CORRECTION C — Wallet Provisioning Decision
// ---------------------------------------------------------------------------
// TransferService.js calls FiatWalletService.createWallet(recipientId, currency)
// for ALL fiat 1-to-1 transfers. FiatWalletService.createWallet:
//   1. Tries wallets_store lookup first
//   2. Falls back to ensure_user_wallet RPC (NATIVE network, race-safe upsert)
//   3. Falls back to direct INSERT
// This is the established invariant for all internal fiat transfers.
// Bulk payment inherits the same behavior for consistency and so that a
// batch is never blocked purely because a recipient hasn't yet triggered
// their lazy-provisioned wallet. The provisioning is metadata-only (no
// ledger entries, no balance mutations).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CORRECTION D — Ambiguous RPC Execution Failure Classification
// ---------------------------------------------------------------------------
// PostgreSQL exception errors come back through supabase-js as structured
// { code, message, hint, details }. Network-level timeouts / connection
// resets surface as generic JS errors without a pg code.
//
// Rules:
//   PG error with code → confirmed DB exception, RPC did NOT commit → FAILED safe
//   JS network error (no pg code) → ambiguous → KEEP EXECUTING state, log warning
//
// The reconciliation path for an EXECUTING batch:
//   1. Check payout_batches.ledger_transaction_id — if set → already COMPLETED in DB
//      (the RPC itself updates the row to COMPLETED before returning)
//   2. Check ledger_transactions_v6 for the idempotency_key — if found → COMPLETED
//   3. Only if neither check finds a committed tx → then mark FAILED
// ---------------------------------------------------------------------------

const PG_ERROR_PREFIXES = [
  'BATCH_NOT_FOUND',
  'BATCH_SOURCE_WALLET_MISMATCH',
  'BATCH_IDEMPOTENCY_KEY_MISMATCH',
  'APPROVAL_GATE_VIOLATION',
  'APPROVAL_METADATA_MISSING',
  'IDEMPOTENCY_BATCH_MISMATCH',
  'BATCH_ITEM_CONTENT_MISMATCH',
  'INVALID_PAYLOAD',
  'SOURCE_WALLET_NOT_FOUND',
  'BATCH_CURRENCY_MISMATCH',
  'SOURCE_WALLET_FROZEN',
  'INSUFFICIENT_SOURCE_BALANCE',
  'SELF_PAYMENT_FORBIDDEN',
  'CURRENCY_MISMATCH',
  'INVALID_AMOUNT',
  'RECIPIENT_WALLET_NOT_FOUND',
  'RECIPIENT_OWNERSHIP_MISMATCH',
  'RECIPIENT_WALLET_FROZEN',
];

/**
 * Returns true when the RPC error is a confirmed PostgreSQL exception
 * (meaning the DB transaction definitely rolled back and did NOT commit).
 */
function isConfirmedPgException(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  // Supabase PostgREST wraps PL/pgSQL RAISE EXCEPTION as structured errors
  // with code 'P0001' or similar, and the message starts with our known prefixes
  if (err.code && String(err.code).startsWith('P')) return true;
  // PGRST codes from PostgREST
  if (err.code && String(err.code).startsWith('PGRST')) return true;
  // Our explicit exception message prefixes
  return PG_ERROR_PREFIXES.some(prefix => msg.startsWith(prefix));
}

class BulkInternalPaymentService {

  // =========================================================================
  // CORRECTION A — True Atomic Batch Creation via create_payout_batch_atomic_v1
  // =========================================================================
  /**
   * Create a new bulk payment batch atomically.
   * Uses create_payout_batch_atomic_v1 RPC (Migration 501) which wraps
   * payout_batches INSERT + all payout_batch_items INSERTs in a single
   * PostgreSQL transaction. Either all rows are created or none are.
   */
  async createBatch(adminUser, data) {
    const { source_wallet_id, currency, entries, idempotency_key } = data || {};

    if (!source_wallet_id) throw new Error('INVALID_INPUT: source_wallet_id is required');
    if (!currency) throw new Error('INVALID_INPUT: currency is required');
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('INVALID_INPUT: entries array must be a non-empty array');
    }

    const upCurrency = String(currency).trim().toUpperCase();

    // 1. Verify Source Wallet
    const { data: sourceWallet, error: swError } = await supabase
      .from('wallets_store')
      .select('id, user_id, currency, is_frozen')
      .eq('id', source_wallet_id)
      .maybeSingle();

    if (swError || !sourceWallet) {
      throw new Error(`SOURCE_WALLET_NOT_FOUND: Wallet ${source_wallet_id} does not exist`);
    }
    if (String(sourceWallet.currency).toUpperCase() !== upCurrency) {
      throw new Error(
        `CURRENCY_MISMATCH: Source wallet currency (${sourceWallet.currency}) ` +
        `does not match requested batch currency (${upCurrency})`
      );
    }
    if (sourceWallet.is_frozen === true) {
      throw new Error(`SOURCE_WALLET_FROZEN: Wallet ${source_wallet_id} is frozen`);
    }

    // 2. Validate Entries & Resolve Recipients Server-Side
    const processedItems = [];
    const seenRecipients = new Set();
    const seenIndexes = new Set();
    let computedTotal = 0;

    for (const entry of entries) {
      const { recipient_identifier, amount, item_index } = entry || {};

      if (!recipient_identifier) {
        throw new Error('INVALID_ITEM: recipient_identifier is required for every entry');
      }

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error(`INVALID_AMOUNT: Amount for recipient ${recipient_identifier} must be > 0`);
      }

      const idx = parseInt(item_index, 10);
      if (isNaN(idx) || idx < 0) {
        throw new Error(
          `INVALID_ITEM_INDEX: item_index must be a non-negative integer for recipient ${recipient_identifier}`
        );
      }
      if (seenIndexes.has(idx)) {
        throw new Error(`DUPLICATE_ITEM_INDEX: item_index ${idx} appears multiple times in payload`);
      }
      seenIndexes.add(idx);

      // Resolve Recipient Profile (server-authoritative)
      const cleanIdent = String(recipient_identifier).trim().toLowerCase();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanIdent);

      let recipientUser = null;
      if (isUUID) {
        const { data: p } = await supabase
          .from('profiles').select('id, status').eq('id', cleanIdent).maybeSingle();
        recipientUser = p;
      } else {
        const { data: pByUsername } = await supabase
          .from('profiles').select('id, status').eq('username', cleanIdent).maybeSingle();
        if (pByUsername) {
          recipientUser = pByUsername;
        } else {
          const { data: pByEmail } = await supabase
            .from('profiles').select('id, status').eq('email', cleanIdent).maybeSingle();
          recipientUser = pByEmail;
        }
      }

      if (!recipientUser) {
        throw new Error(`RECIPIENT_NOT_FOUND: Recipient "${recipient_identifier}" not found in our system`);
      }

      const recipUserId = recipientUser.id;

      if (recipUserId === adminUser.id || recipUserId === sourceWallet.user_id) {
        throw new Error(
          `SELF_PAYMENT_FORBIDDEN: Recipient ${recipient_identifier} matches source wallet owner or admin`
        );
      }
      if (seenRecipients.has(recipUserId)) {
        throw new Error(`DUPLICATE_RECIPIENT: Recipient ${recipient_identifier} appears multiple times in batch`);
      }
      seenRecipients.add(recipUserId);

      // CORRECTION C: Wallet resolution uses FiatWalletService.createWallet —
      // matching the existing TransferService invariant (lazy provisioning via
      // ensure_user_wallet RPC → NATIVE network). This is a metadata-only
      // operation; no ledger entries are created here.
      const recipWallet = await FiatWalletService.createWallet(recipUserId, upCurrency);

      if (!recipWallet) {
        throw new Error(
          `RECIPIENT_WALLET_NOT_FOUND: Wallet not found for recipient ${recipient_identifier} (${upCurrency})`
        );
      }
      if (recipWallet.is_frozen === true) {
        throw new Error(`RECIPIENT_WALLET_FROZEN: Wallet for recipient ${recipient_identifier} is frozen`);
      }
      // Ownership guard
      if (recipWallet.user_id !== recipUserId) {
        throw new Error(
          `RECIPIENT_WALLET_OWNERSHIP_MISMATCH: Resolved wallet for ${recipient_identifier} ` +
          `belongs to a different user`
        );
      }

      computedTotal += numAmount;
      processedItems.push({
        recipient_user_id:  recipUserId,
        recipient_wallet_id: recipWallet.id,
        amount:              numAmount,
        currency:            upCurrency,
        item_index:          idx,
      });
    }

    const recipientCount = processedItems.length;

    // 3. Request-Level Idempotency Check (header + full item set)
    const rawKey = idempotency_key || data.client_key;
    const finalIdempotencyKey = rawKey ? `bulk_batch_${rawKey}` : `bulk_batch_${uuidv4()}`;

    const { data: existingBatch } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('idempotency_key', finalIdempotencyKey)
      .maybeSingle();

    if (existingBatch) {
      // CORRECTION B: Full payload comparison — header + complete child item set
      const headerMatch =
        existingBatch.source_wallet_id === source_wallet_id &&
        String(existingBatch.currency).toUpperCase() === upCurrency &&
        parseFloat(existingBatch.total_amount) === computedTotal &&
        existingBatch.recipient_count === recipientCount;

      if (!headerMatch) {
        throw new Error(
          `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Idempotency key ${finalIdempotencyKey} ` +
          `was reused with different header payload (source_wallet, currency, total_amount, or recipient_count mismatch)`
        );
      }

      // Compare child items: load persisted items ordered by item_index
      const { data: existingItems } = await supabase
        .from('payout_batch_items')
        .select('recipient_user_id, recipient_wallet_id, amount, currency, item_index')
        .eq('batch_id', existingBatch.id)
        .order('item_index', { ascending: true });

      const sortedNew = [...processedItems].sort((a, b) => a.item_index - b.item_index);
      const sortedExisting = (existingItems || []).sort((a, b) => a.item_index - b.item_index);

      if (sortedNew.length !== sortedExisting.length) {
        throw new Error(
          `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Idempotency key ${finalIdempotencyKey} ` +
          `item count mismatch (persisted: ${sortedExisting.length}, new: ${sortedNew.length})`
        );
      }

      for (let i = 0; i < sortedNew.length; i++) {
        const n = sortedNew[i];
        const e = sortedExisting[i];
        if (
          n.item_index          !== e.item_index ||
          n.recipient_user_id   !== e.recipient_user_id ||
          n.recipient_wallet_id !== e.recipient_wallet_id ||
          parseFloat(n.amount)  !== parseFloat(e.amount) ||
          n.currency.toUpperCase() !== String(e.currency).toUpperCase()
        ) {
          throw new Error(
            `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Idempotency key ${finalIdempotencyKey} ` +
            `item at index ${n.item_index} does not match persisted item ` +
            `(recipient, wallet, amount, or currency mismatch)`
          );
        }
      }

      // Full match — return existing batch
      return { success: true, batch: existingBatch, items: existingItems || [], is_retry: true };
    }

    // 4. CORRECTION A: Atomic batch creation via PostgreSQL RPC (Migration 501)
    //    create_payout_batch_atomic_v1 inserts payout_batches + all
    //    payout_batch_items in one transaction. Either all succeed or none do.
    const randTag = Math.random().toString(36).substring(2, 8).toUpperCase();
    const batchRef = `PB_${Date.now()}_${randTag}`;

    const itemsPayload = processedItems.map(item => ({
      recipient_user_id:  item.recipient_user_id,
      recipient_wallet_id: item.recipient_wallet_id,
      amount:              item.amount,
      currency:            item.currency,
      item_index:          item.item_index,
    }));

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'create_payout_batch_atomic_v1',
      {
        p_batch_reference:  batchRef,
        p_created_by:       adminUser.id,
        p_source_wallet_id: source_wallet_id,
        p_currency:         upCurrency,
        p_total_amount:     computedTotal,
        p_recipient_count:  recipientCount,
        p_idempotency_key:  finalIdempotencyKey,
        p_items:            itemsPayload,
      }
    );

    if (rpcError || !rpcResult) {
      throw new Error(
        `BATCH_CREATION_FAILED: Atomic batch creation RPC failed — ` +
        (rpcError ? rpcError.message : 'no result returned')
      );
    }

    const newBatchId = rpcResult.batch_id;

    // 5. Fetch the created batch header and items for the response
    const { data: newBatch } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', newBatchId)
      .maybeSingle();

    const { data: insertedItems } = await supabase
      .from('payout_batch_items')
      .select('*')
      .eq('batch_id', newBatchId)
      .order('item_index', { ascending: true });

    // 6. Audit Log
    await logAdminAction(
      { user: adminUser, ip: null, headers: {} },
      'create_payout_batch',
      'payout_batch',
      newBatchId,
      {
        batch_reference:  batchRef,
        total_amount:     computedTotal,
        currency:         upCurrency,
        recipient_count:  recipientCount,
        idempotency_key:  finalIdempotencyKey,
      }
    );

    return { success: true, batch: newBatch, items: insertedItems || [] };
  }

  // =========================================================================
  // List payout batches (paginated)
  // =========================================================================
  async getBatches(query = {}) {
    const page  = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    let q = supabase.from('payout_batches').select('*', { count: 'exact' });
    if (query.status)   q = q.eq('status', query.status);
    if (query.currency) q = q.eq('currency', query.currency.toUpperCase());

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { batches: data || [], total: count || 0, page, limit };
  }

  // =========================================================================
  // Get batch detail with items
  // =========================================================================
  async getBatchDetail(batchId) {
    const { data: batch, error: bError } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();

    if (bError || !batch) throw new Error(`BATCH_NOT_FOUND: Batch ${batchId} does not exist`);

    const { data: items, error: iError } = await supabase
      .from('payout_batch_items')
      .select('*')
      .eq('batch_id', batchId)
      .order('item_index', { ascending: true });

    if (iError) throw iError;
    return { batch, items: items || [] };
  }

  // =========================================================================
  // Approve a batch (Dual Authorization enforced)
  // =========================================================================
  async approveBatch(adminUser, batchId) {
    const { data: batch } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();

    if (!batch) throw new Error(`BATCH_NOT_FOUND: Batch ${batchId} does not exist`);

    if (batch.status !== 'PENDING_APPROVAL') {
      throw new Error(
        `INVALID_STATUS_TRANSITION: Batch ${batchId} is in status ${batch.status}, cannot approve.`
      );
    }
    if (batch.created_by === adminUser.id) {
      throw new Error(
        'CREATOR_CANNOT_APPROVE: Admin who created the batch cannot approve it (dual authorization required).'
      );
    }

    const { data: updated, error } = await supabase
      .from('payout_batches')
      .update({
        status:      'APPROVED',
        approved_by: adminUser.id,
        approved_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq('id', batchId)
      .eq('status', 'PENDING_APPROVAL')
      .neq('created_by', adminUser.id)
      .select()
      .maybeSingle();

    if (error || !updated) {
      throw new Error(
        `APPROVAL_FAILED: Unable to approve batch ${batchId}. ` +
        `It may have been modified or approved by another process.`
      );
    }

    await logAdminAction(
      { user: adminUser, ip: null, headers: {} },
      'approve_payout_batch',
      'payout_batch',
      batchId,
      { batch_reference: updated.batch_reference, approved_by: adminUser.id }
    );

    return { success: true, batch: updated };
  }

  // =========================================================================
  // CORRECTION D + E — Execute batch with ambiguous-failure safety
  // =========================================================================
  async executeBatch(adminUser, batchId) {
    if (SystemState.isSafe()) {
      throw new Error('SAFE_MODE_BLOCK: Ledger mutations disabled in safe mode');
    }

    // Load batch from DB (never from client)
    const { data: batch } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();

    if (!batch) throw new Error(`BATCH_NOT_FOUND: Batch ${batchId} does not exist`);

    // CORRECTION E: Idempotent re-entry for COMPLETED
    if (batch.status === 'COMPLETED') {
      return {
        success: true,
        status:  'COMPLETED',
        transactionId: batch.ledger_transaction_id,
        message: 'Batch was already completed.',
      };
    }

    // CORRECTION E: If EXECUTING (previous run that may have ambiguously failed),
    // reconcile DB state before deciding to re-execute or mark failed.
    if (batch.status === 'EXECUTING') {
      return this._reconcileExecutingBatch(adminUser, batch);
    }

    if (batch.status !== 'APPROVED') {
      throw new Error(
        `APPROVAL_GATE_VIOLATION: Batch ${batchId} is in status ${batch.status}. ` +
        `Must be APPROVED to execute.`
      );
    }
    if (!batch.approved_by || !batch.approved_at) {
      throw new Error(
        `APPROVAL_METADATA_MISSING: Batch ${batchId} status is ${batch.status} ` +
        `but lacks approved_by or approved_at timestamp.`
      );
    }

    // Load authoritative child items from DB
    const { data: items, error: iError } = await supabase
      .from('payout_batch_items')
      .select('recipient_user_id, recipient_wallet_id, amount, currency, item_index')
      .eq('batch_id', batchId)
      .order('item_index', { ascending: true });

    if (iError || !items || items.length === 0) {
      throw new Error(`BATCH_ITEMS_NOT_FOUND: No batch items found for batch ${batchId}`);
    }

    // CORRECTION E: Atomic status transition APPROVED → EXECUTING
    // Uses conditional UPDATE so only ONE concurrent caller wins.
    const { data: claimResult, error: claimErr } = await supabase
      .from('payout_batches')
      .update({ status: 'EXECUTING', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('status', 'APPROVED')   // only wins if still APPROVED
      .select('id, status')
      .maybeSingle();

    if (claimErr || !claimResult) {
      // Another executor already claimed EXECUTING, or the batch moved to COMPLETED
      const { data: current } = await supabase
        .from('payout_batches').select('status, ledger_transaction_id').eq('id', batchId).maybeSingle();
      if (current?.status === 'COMPLETED') {
        return {
          success: true, status: 'COMPLETED',
          transactionId: current.ledger_transaction_id,
          message: 'Batch was completed by a concurrent executor.',
        };
      }
      throw new Error(
        `EXECUTION_CONCURRENCY_CONFLICT: Batch ${batchId} is already being executed ` +
        `by another process (current status: ${current?.status || 'unknown'}).`
      );
    }

    // Build p_entries from DB items (never from client payload)
    const entries = items.map(item => ({
      recipient_user_id:  item.recipient_user_id,
      recipient_wallet_id: item.recipient_wallet_id,
      currency:            String(item.currency).toUpperCase(),
      amount:              parseFloat(item.amount),
      item_index:          item.item_index,
    }));

    // Call atomic database RPC via service role
    let txId, rpcError;
    try {
      const result = await supabaseAdmin.rpc('execute_bulk_internal_transfer_v1', {
        p_batch_id:         batch.id,
        p_idempotency_key:  batch.idempotency_key,
        p_source_wallet_id: batch.source_wallet_id,
        p_entries:          entries,
      });
      txId = result.data;
      rpcError = result.error;
    } catch (networkErr) {
      // CORRECTION D: Network-level error (timeout, reset, cancellation).
      // We cannot know whether the DB transaction committed.
      // Keep EXECUTING state and let reconciliation determine the truth.
      logger.error(
        `[BulkInternalPayment] NETWORK ERROR during RPC for batch ${batchId}:`,
        networkErr.message
      );
      await logAdminAction(
        { user: adminUser, ip: null, headers: {} },
        'execute_payout_batch_network_error',
        'payout_batch',
        batchId,
        {
          batch_reference: batch.batch_reference,
          error:           networkErr.message,
          note:            'EXECUTING state preserved for reconciliation',
        }
      );
      throw new Error(
        `EXECUTION_NETWORK_ERROR: RPC call for batch ${batchId} failed with a network-level ` +
        `error (${networkErr.message}). Batch remains EXECUTING. ` +
        `Call POST /:id/reconcile to determine final state.`
      );
    }

    if (rpcError) {
      // CORRECTION D: Classify the error
      if (isConfirmedPgException(rpcError)) {
        // Confirmed DB exception — RPC did NOT commit, safe to mark FAILED
        logger.error(`[BulkInternalPayment] Confirmed PG exception for batch ${batchId}:`, rpcError.message);

        await supabase
          .from('payout_batches')
          .update({
            status:         'FAILED',
            failure_reason: rpcError.message,
            updated_at:     new Date().toISOString(),
          })
          .eq('id', batchId)
          .neq('status', 'COMPLETED'); // never overwrite COMPLETED

        await logAdminAction(
          { user: adminUser, ip: null, headers: {} },
          'execute_payout_batch_failed',
          'payout_batch',
          batchId,
          {
            batch_reference: batch.batch_reference,
            failure_reason:  rpcError.message,
            executed_by:     adminUser.id,
          }
        );
        throw new Error(`EXECUTION_FAILURE: ${rpcError.message}`);
      } else {
        // Ambiguous — keep EXECUTING, do not mark FAILED
        logger.error(
          `[BulkInternalPayment] AMBIGUOUS RPC error for batch ${batchId}:`,
          rpcError.message
        );
        await logAdminAction(
          { user: adminUser, ip: null, headers: {} },
          'execute_payout_batch_ambiguous_error',
          'payout_batch',
          batchId,
          {
            batch_reference: batch.batch_reference,
            error:           rpcError.message,
            note:            'EXECUTING state preserved for reconciliation',
          }
        );
        throw new Error(
          `EXECUTION_AMBIGUOUS_ERROR: RPC for batch ${batchId} returned an ambiguous error. ` +
          `Batch remains EXECUTING. Call POST /:id/reconcile to determine final state.`
        );
      }
    }

    // RPC succeeded — the RPC itself already updated payout_batches to COMPLETED
    // and payout_batch_items to SUCCESSFUL inside its own transaction.
    // Record the audit trail.
    await logAdminAction(
      { user: adminUser, ip: null, headers: {} },
      'execute_payout_batch_success',
      'payout_batch',
      batchId,
      {
        batch_reference:      batch.batch_reference,
        total_amount:         batch.total_amount,
        currency:             batch.currency,
        recipient_count:      batch.recipient_count,
        idempotency_key:      batch.idempotency_key,
        ledger_transaction_id: txId,
        executed_by:          adminUser.id,
      }
    );

    // Non-blocking async notifications (only after confirmed commit)
    setImmediate(async () => {
      try {
        for (const item of items) {
          try {
            realtime.emitToUser(item.recipient_user_id, 'wallet_credited', {
              amount:          item.amount,
              currency:        item.currency,
              batch_reference: batch.batch_reference,
            });
            await createNotification({
              receiverId: item.recipient_user_id,
              type:    'wallet_credit',
              title:   'Account Credited',
              body:    `Your wallet has been credited with ${item.amount} ${item.currency} ` +
                       `(Ref: ${batch.batch_reference}).`,
            });
          } catch (notifErr) {
            logger.warn(
              `[BulkInternalPayment] Async notification failed for recipient ${item.recipient_user_id}:`,
              notifErr.message
            );
          }
        }
      } catch (e) {
        logger.error('[BulkInternalPayment] Async notification loop crashed:', e.message);
      }
    });

    return {
      success: true,
      status:  'COMPLETED',
      transactionId: txId,
      message: 'Bulk internal payment executed successfully.',
    };
  }

  // =========================================================================
  // CORRECTION D: Reconcile an EXECUTING batch
  // Determines true state from authoritative DB records.
  // =========================================================================
  async _reconcileExecutingBatch(adminUser, batch) {
    const batchId = batch.id;
    logger.info(`[BulkInternalPayment] Reconciling EXECUTING batch ${batchId}`);

    // Check 1: Does payout_batches already show COMPLETED in a fresh read?
    const { data: freshBatch } = await supabase
      .from('payout_batches')
      .select('status, ledger_transaction_id')
      .eq('id', batchId)
      .maybeSingle();

    if (freshBatch?.status === 'COMPLETED' && freshBatch.ledger_transaction_id) {
      return {
        success: true, status: 'COMPLETED',
        transactionId: freshBatch.ledger_transaction_id,
        message: 'Batch was already completed (reconciled from EXECUTING state).',
        reconciled: true,
      };
    }

    // Check 2: Does ledger_transactions_v6 have a committed tx for this idempotency key?
    const { data: existingTx } = await supabase
      .from('ledger_transactions_v6')
      .select('id, metadata')
      .eq('idempotency_key', batch.idempotency_key)
      .maybeSingle();

    if (existingTx) {
      // Ledger tx committed. Update payout_batches to COMPLETED now.
      await supabase
        .from('payout_batches')
        .update({
          status:                'COMPLETED',
          ledger_transaction_id: existingTx.id,
          completed_at:          new Date().toISOString(),
          updated_at:            new Date().toISOString(),
        })
        .eq('id', batchId)
        .neq('status', 'COMPLETED');

      await logAdminAction(
        { user: adminUser, ip: null, headers: {} },
        'reconcile_payout_batch_completed',
        'payout_batch',
        batchId,
        {
          batch_reference:       batch.batch_reference,
          ledger_transaction_id: existingTx.id,
          note:                  'Reconciled from EXECUTING — ledger tx confirmed committed',
        }
      );

      return {
        success: true, status: 'COMPLETED',
        transactionId: existingTx.id,
        message: 'Batch reconciled — ledger transaction was found committed.',
        reconciled: true,
      };
    }

    // Check 3: No committed tx found. Batch truly did not commit.
    // Only now is it safe to mark FAILED.
    await supabase
      .from('payout_batches')
      .update({
        status:         'FAILED',
        failure_reason: 'Reconciled from EXECUTING — no committed ledger transaction found',
        updated_at:     new Date().toISOString(),
      })
      .eq('id', batchId)
      .eq('status', 'EXECUTING'); // must still be EXECUTING to avoid races

    await logAdminAction(
      { user: adminUser, ip: null, headers: {} },
      'reconcile_payout_batch_failed',
      'payout_batch',
      batchId,
      {
        batch_reference: batch.batch_reference,
        note:            'Reconciled from EXECUTING — no committed ledger transaction found',
      }
    );

    throw new Error(
      `RECONCILIATION_FAILED: Batch ${batchId} was in EXECUTING state but no committed ` +
      `ledger transaction was found. Batch has been marked FAILED.`
    );
  }

  // =========================================================================
  // Public reconcileBatch — entry point for POST /:id/reconcile
  // =========================================================================
  async reconcileBatch(adminUser, batchId) {
    const { data: batch } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();

    if (!batch) throw new Error(`BATCH_NOT_FOUND: Batch ${batchId} does not exist`);

    if (batch.status === 'COMPLETED') {
      return {
        success: true, status: 'COMPLETED',
        transactionId: batch.ledger_transaction_id,
        message: 'Batch is already COMPLETED — no reconciliation needed.',
        reconciled: false,
      };
    }

    if (batch.status === 'FAILED' || batch.status === 'CANCELLED') {
      return {
        success: true, status: batch.status,
        message: `Batch is already in terminal status ${batch.status} — no reconciliation needed.`,
        reconciled: false,
      };
    }

    if (batch.status !== 'EXECUTING') {
      throw new Error(
        `RECONCILE_INVALID_STATE: Batch ${batchId} is in status ${batch.status}. ` +
        `Only EXECUTING batches can be reconciled.`
      );
    }

    return this._reconcileExecutingBatch(adminUser, batch);
  }

  // =========================================================================
  // Cancel a batch
  // =========================================================================
  async cancelBatch(adminUser, batchId) {
    const { data: batch } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();

    if (!batch) throw new Error(`BATCH_NOT_FOUND: Batch ${batchId} does not exist`);

    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(batch.status)) {
      throw new Error(
        `INVALID_STATUS_TRANSITION: Batch ${batchId} is in status ${batch.status}, cannot cancel.`
      );
    }

    const { data: updated, error } = await supabase
      .from('payout_batches')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .in('status', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])
      .select()
      .maybeSingle();

    if (error || !updated) {
      throw new Error(
        `CANCELLATION_FAILED: Unable to cancel batch ${batchId}. ` +
        `It may be currently executing or completed.`
      );
    }

    await logAdminAction(
      { user: adminUser, ip: null, headers: {} },
      'cancel_payout_batch',
      'payout_batch',
      batchId,
      {
        batch_reference: updated.batch_reference,
        cancelled_by:    adminUser.id,
        previous_status: batch.status,
      }
    );

    return { success: true, batch: updated };
  }
}

module.exports = new BulkInternalPaymentService();
