/**
 * DepositCreditEngine.js
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SINGLE AUTHORITATIVE ENTRY POINT for crediting user wallets after payment.
 *
 * EVERY webhook handler, reconciliation worker, polling endpoint, and admin
 * action MUST go through this service.  No other code path may directly call
 * confirm_deposit, FiatWalletService.fundWallet, or update wallets_store
 * balances for deposit credits.
 *
 * Guarantees:
 *   1. Exactly-once wallet credit per transaction (DB-level idempotency)
 *   2. Atomic: transaction status + wallet balance updated together in one RPC
 *   3. Safe under concurrent execution (uses SELECT … FOR UPDATE inside the RPC)
 *   4. Clear return value: callers ALWAYS know if credit was applied or skipped
 *   5. Notifications/realtime emitted only on first successful credit
 *
 * NoteStandard Financial Platform — Permanent Wallet Credit Fix
 */

'use strict';

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// Lazy-loaded to break circular dependency chains
let _fiatWalletService = null;
let _realtimeService   = null;
let _notificationSvc   = null;
let _auditLogService   = null;

function getFiatWalletService() {
  if (!_fiatWalletService) _fiatWalletService = require('../FiatWalletService');
  return _fiatWalletService;
}
function getRealtimeService() {
  if (!_realtimeService) _realtimeService = require('../realtimeService');
  return _realtimeService;
}
function getNotificationService() {
  if (!_notificationSvc) _notificationSvc = require('../notificationService');
  return _notificationSvc;
}
function getAuditLogService() {
  if (!_auditLogService) _auditLogService = require('../AuditLogService');
  return _auditLogService;
}

/**
 * Canonical result shape returned by every credit attempt.
 * Callers can always rely on these fields existing.
 */
function makeResult({ credited = false, alreadyCredited = false, transactionId = null, error = null, amount = 0, currency = '' }) {
  return { credited, alreadyCredited, transactionId, error, amount, currency };
}

class DepositCreditEngine {
  /**
   * Credit a user's wallet for a verified deposit.
   *
   * @param {Object}  params
   * @param {string}  params.transactionId        - UUID of the transactions row (preferred)
   * @param {string}  [params.reference]           - reference_id or provider_reference (fallback lookup)
   * @param {number}  [params.amount]              - override amount (defaults to tx.amount)
   * @param {string}  [params.currency]            - override currency (must match tx currency if provided)
   * @param {string}  [params.userId]              - override user (defaults to tx.user_id)
   * @param {string}  [params.providerTxId]        - external provider transaction ID for audit
   * @param {string}  [params.source]              - calling context e.g. 'PAYSTACK_WEBHOOK', 'FINCRA_WEBHOOK', 'RECONCILIATION_WORKER'
   * @param {Object}  [params.auditMeta]           - extra metadata for audit log
   *
   * @returns {Promise<{credited: boolean, alreadyCredited: boolean, transactionId: string|null, error: string|null, amount: number, currency: string}>}
   */
  async credit({
    transactionId = null,
    reference     = null,
    amount        = null,
    currency      = null,
    userId        = null,
    providerTxId  = null,
    source        = 'SYSTEM',
    auditMeta     = {},
  }) {
    // ── 1. Resolve the transaction record ──────────────────────────────────
    const lookupKey = transactionId || reference;
    if (!lookupKey) {
      logger.error('[DepositCreditEngine] Missing both transactionId and reference. Cannot credit.');
      return makeResult({ error: 'MISSING_REFERENCE' });
    }

    let tx;
    try {
      tx = await this._fetchTransaction(transactionId, reference);
    } catch (fetchErr) {
      logger.error(`[DepositCreditEngine] DB error fetching transaction for ${lookupKey}: ${fetchErr.message}`);
      return makeResult({ error: `DB_FETCH_ERROR: ${fetchErr.message}` });
    }

    if (!tx) {
      logger.warn(`[DepositCreditEngine] Transaction not found: ${lookupKey}`);
      return makeResult({ error: 'TRANSACTION_NOT_FOUND' });
    }

    // ── 2. Early idempotency check (before any heavy work) ─────────────────
    const txStatus = (tx.status || '').toUpperCase();
    if (['COMPLETED', 'SUCCESS'].includes(txStatus)) {
      logger.info(`[DepositCreditEngine] Idempotency hit: tx ${tx.id} already ${txStatus}. Source: ${source}`);
      return makeResult({
        alreadyCredited: true,
        transactionId:   tx.id,
        amount:          tx.amount,
        currency:        tx.currency,
      });
    }

    // Also check wallet_credit_status for fine-grained idempotency
    if (tx.wallet_credit_status === 'WALLET_CREDITED' || tx.payment_status === 'WALLET_CREDITED') {
      logger.info(`[DepositCreditEngine] Idempotency hit (wallet_credit_status): tx ${tx.id}. Source: ${source}`);
      return makeResult({
        alreadyCredited: true,
        transactionId:   tx.id,
        amount:          tx.amount,
        currency:        tx.currency,
      });
    }

    // ── 3. Validate currency match ─────────────────────────────────────────
    const targetCurrency = (tx.currency || '').toUpperCase();
    if (currency && currency.toUpperCase() !== targetCurrency) {
      const msg = `CURRENCY_MISMATCH: Provided ${currency}, tx has ${targetCurrency}`;
      logger.error(`[DepositCreditEngine] ${msg}. Tx: ${tx.id}`);
      return makeResult({ error: msg, transactionId: tx.id });
    }

    const creditAmount = parseFloat(amount || tx.amount || 0);
    if (creditAmount <= 0) {
      logger.error(`[DepositCreditEngine] Invalid amount ${creditAmount} for tx ${tx.id}`);
      return makeResult({ error: `INVALID_AMOUNT: ${creditAmount}`, transactionId: tx.id });
    }

    const targetUserId = userId || tx.user_id;

    // ── 4. Ensure the user wallet exists ───────────────────────────────────
    let wallet;
    try {
      wallet = await getFiatWalletService().createWallet(targetUserId, targetCurrency);
    } catch (walletErr) {
      logger.error(`[DepositCreditEngine] Wallet creation/lookup failed for user ${targetUserId} (${targetCurrency}): ${walletErr.message}`);
      return makeResult({ error: `WALLET_ERROR: ${walletErr.message}`, transactionId: tx.id });
    }

    if (!wallet || !wallet.id) {
      logger.error(`[DepositCreditEngine] Wallet is null after create for user ${targetUserId} (${targetCurrency})`);
      return makeResult({ error: 'WALLET_NOT_FOUND', transactionId: tx.id });
    }

    // ── 5. Execute the atomic credit via confirm_deposit_v7 RPC ────────────
    //   This RPC does SELECT … FOR UPDATE on the transaction row,
    //   checks idempotency, credits the wallet, and returns a boolean.
    const externalHash = providerTxId || tx.provider_transaction_id || tx.reference_id || reference || '';

    let creditApplied = false;
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_deposit_v7', {
        p_transaction_id:  tx.id,
        p_wallet_id:       wallet.id,
        p_amount:          creditAmount,
        p_external_hash:   externalHash,
        p_source:          source,
      });

      if (rpcError) {
        // Check if the error is due to the v7 RPC not existing yet (migration not applied)
        if (rpcError.message && rpcError.message.includes('confirm_deposit_v7')) {
          logger.warn(`[DepositCreditEngine] confirm_deposit_v7 not available, falling back to confirm_deposit`);
          creditApplied = await this._fallbackConfirmDeposit(tx, wallet, creditAmount, externalHash, source);
        } else {
          throw rpcError;
        }
      } else {
        creditApplied = rpcResult === true;
      }
    } catch (rpcErr) {
      logger.error(`[DepositCreditEngine] RPC FAILURE for tx ${tx.id}: ${rpcErr.message}`);

      // Attempt the legacy confirm_deposit as a fallback
      try {
        creditApplied = await this._fallbackConfirmDeposit(tx, wallet, creditAmount, externalHash, source);
      } catch (fallbackErr) {
        logger.error(`[DepositCreditEngine] Fallback confirm_deposit also failed for tx ${tx.id}: ${fallbackErr.message}`);
        return makeResult({ error: `RPC_FAILURE: ${rpcErr.message}`, transactionId: tx.id, amount: creditAmount, currency: targetCurrency });
      }
    }

    // ── 6. Verify the credit actually happened ─────────────────────────────
    //   Re-read the transaction to confirm it's COMPLETED.
    //   This catches the case where confirm_deposit returned void (old RPC)
    //   and we can't tell from the return value alone.
    if (!creditApplied) {
      const { data: recheck } = await supabase
        .from('transactions')
        .select('status, wallet_credit_status')
        .eq('id', tx.id)
        .single();

      if (recheck && ['COMPLETED', 'SUCCESS'].includes((recheck.status || '').toUpperCase())) {
        creditApplied = true;
        logger.info(`[DepositCreditEngine] Post-RPC verification: tx ${tx.id} is COMPLETED (credit was applied by RPC).`);
      }
    }

    if (!creditApplied) {
      // The RPC didn't credit (state guard or idempotency in old RPC).
      // Check if we're in an already-credited scenario that the old RPC silently handled.
      logger.warn(`[DepositCreditEngine] RPC did not apply credit for tx ${tx.id}. Checking if already credited...`);

      const { data: finalCheck } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', tx.id)
        .single();

      if (finalCheck && ['COMPLETED', 'SUCCESS'].includes((finalCheck.status || '').toUpperCase())) {
        return makeResult({
          alreadyCredited: true,
          transactionId:   tx.id,
          amount:          creditAmount,
          currency:        targetCurrency,
        });
      }

      logger.error(`[DepositCreditEngine] CREDIT NOT APPLIED for tx ${tx.id}. Status: ${finalCheck?.status}. Source: ${source}. MANUAL REVIEW REQUIRED.`);
      return makeResult({ error: 'CREDIT_NOT_APPLIED', transactionId: tx.id, amount: creditAmount, currency: targetCurrency });
    }

    // ── 7. Update supplementary transaction fields ─────────────────────────
    //   The RPC already sets status=COMPLETED. Update extra fields that
    //   exist only at the application level.
    try {
      const now = new Date().toISOString();
      await supabase
        .from('transactions')
        .update({
          wallet_credit_status: 'WALLET_CREDITED',
          payment_status:       'PAYMENT_CONFIRMED',
          provider_transaction_id: providerTxId || tx.provider_transaction_id || externalHash,
          completed_at: now,
          updated_at:   now,
          metadata: {
            ...(tx.metadata || {}),
            credit_source:        source,
            credited_at:          now,
            credit_engine:        'DepositCreditEngine_v1',
            provider_tx_id:       providerTxId,
          },
        })
        .eq('id', tx.id)
        .neq('wallet_credit_status', 'WALLET_CREDITED'); // conditional update for safety
    } catch (updateErr) {
      // Non-fatal: the credit already happened at the RPC level.
      logger.warn(`[DepositCreditEngine] Supplementary update warning for tx ${tx.id}: ${updateErr.message}`);
    }

    // ── 8. Post-credit side effects (non-blocking) ─────────────────────────
    this._emitPostCreditEffects(targetUserId, creditAmount, targetCurrency, tx, source, auditMeta).catch(
      (err) => logger.warn(`[DepositCreditEngine] Post-credit effects warning: ${err.message}`)
    );

    logger.info(`[DepositCreditEngine] ✅ SUCCESS: Credited ${creditAmount} ${targetCurrency} to user ${targetUserId} for tx ${tx.id} (Source: ${source})`);

    return makeResult({
      credited:      true,
      transactionId: tx.id,
      amount:        creditAmount,
      currency:      targetCurrency,
    });
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Fetch a transaction by ID or reference.
   * Prefers ID lookup; falls back to reference_id / provider_reference.
   */
  async _fetchTransaction(transactionId, reference) {
    let query = supabase.from('transactions').select('*');

    if (transactionId) {
      query = query.eq('id', transactionId);
    } else if (reference) {
      query = query.or(`reference_id.eq.${reference},provider_reference.eq.${reference}`);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Fallback to the legacy confirm_deposit RPC (returns void).
   * Since it returns void, we verify by re-reading the transaction status.
   */
  async _fallbackConfirmDeposit(tx, wallet, creditAmount, externalHash, source) {
    const { error: rpcError } = await supabase.rpc('confirm_deposit', {
      p_transaction_id: tx.id,
      p_wallet_id:      wallet.id,
      p_amount:         creditAmount,
      p_external_hash:  externalHash,
      p_override:       !['PENDING', 'PROCESSING'].includes((tx.status || '').toUpperCase()),
      p_override_reason: `deposit_credit_engine_${source.toLowerCase()}`,
    });

    if (rpcError) {
      throw rpcError;
    }

    // The old RPC returns void. Verify by checking if status changed.
    const { data: postCheck } = await supabase
      .from('transactions')
      .select('status')
      .eq('id', tx.id)
      .single();

    return postCheck && ['COMPLETED', 'SUCCESS'].includes((postCheck.status || '').toUpperCase());
  }

  /**
   * Non-blocking post-credit effects: audit log, notification, realtime event.
   * Wrapped so that failures here NEVER affect the credit outcome.
   */
  async _emitPostCreditEffects(userId, amount, currency, tx, source, auditMeta) {
    // Audit log
    try {
      await getAuditLogService().log({
        user_id:   userId,
        action:    'deposit_credited',
        provider:  tx.provider || 'unknown',
        reference: tx.reference_id,
        amount,
        currency,
        source,
        ledger_id: tx.id,
        ...auditMeta,
      });
    } catch (e) {
      logger.warn(`[DepositCreditEngine] Audit log warning: ${e.message}`);
    }

    // Push notification
    try {
      const { createNotification } = getNotificationService();
      await createNotification({
        receiverId: userId,
        type:       'wallet_deposit',
        title:      'Deposit Successful',
        message:    `Your deposit of ${amount.toLocaleString()} ${currency} has been credited to your wallet.`,
        link:       '/dashboard/wallet',
      });
    } catch (e) {
      logger.warn(`[DepositCreditEngine] Notification warning: ${e.message}`);
    }

    // Email notification on wallet credit
    try {
      const sendgridEmailService = require('../sendgridEmailService');
      let userEmail = tx.user_email || tx.email;
      if (!userEmail && userId) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle();
        userEmail = userProfile?.email;
      }

      if (userEmail) {
        await sendgridEmailService.sendDepositApprovedEmail(userEmail, {
          amount,
          currency,
          reference: tx.reference_id || tx.id,
        });
        logger.info(`[DepositCreditEngine] Deposit confirmation email dispatched to ${userEmail} for ${amount} ${currency}`);
      } else {
        logger.warn(`[DepositCreditEngine] User email not found for user ${userId}, unable to send deposit confirmation email`);
      }
    } catch (e) {
      logger.warn(`[DepositCreditEngine] Email notification warning: ${e.message}`);
    }

    // Realtime event
    try {
      const realtime = getRealtimeService();
      if (realtime && typeof realtime.emitToUser === 'function') {
        await realtime.emitToUser(userId, 'wallet_update', {
          type:      'deposit',
          currency,
          amount,
          status:    'COMPLETED',
          reference: tx.reference_id,
        });
      }
    } catch (e) {
      logger.warn(`[DepositCreditEngine] Realtime warning: ${e.message}`);
    }
  }
}

module.exports = new DepositCreditEngine();
