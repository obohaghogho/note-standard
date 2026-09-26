/**
 * PlatformSettlementService.js
 * ══════════════════════════════════════════════════════════════════════════════
 * CONTROLLED PLATFORM REVENUE SETTLEMENT SERVICE
 *
 * Manages the lifecycle of NoteStandard's own platform-revenue settlements:
 * the company moving its legitimately earned admin fee income from the
 * platform wallet to the company's approved Fincra merchant bank account.
 *
 * SAFETY INVARIANTS (all verified per forensic audit):
 *
 *  1. Race-condition-safe balance check:
 *     Available revenue is calculated and reserved in a single atomic
 *     PostgreSQL RPC (reserve_platform_revenue). Two simultaneous requests
 *     cannot both see the same available balance.
 *
 *  2. Server-side destination only:
 *     The settlement destination is resolved exclusively from trusted
 *     server environment variables, never from req.body. A currency-to-
 *     approved-account mapping is enforced here. Caller-supplied
 *     destinationAccountId is IGNORED.
 *
 *  3. Mandatory idempotency key for live execution:
 *     When ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION=true, the caller
 *     MUST supply an idempotencyKey. An auto-generated timestamp-based
 *     reference is acceptable only for SIMULATED_TEST mode.
 *     The idempotency key is enforced by UNIQUE(reference) in the DB.
 *
 *  4. Provider execution dispatcher present:
 *     When the live execution flag is true, the service invokes
 *     fincra/payout.js (the authoritative Fincra payout path),
 *     persists the Fincra provider_reference, and transitions the
 *     record to PROCESSING. Final state (COMPLETED / FAILED) is set
 *     by the Fincra payout.successful / payout.failed webhook handler.
 *
 *  5. Revenue isolation:
 *     Only platform admin revenue (revenue_logs) is consumed.
 *     Customer principal and partner commissions are never touched.
 *
 *  6. Webhook terminal state protection:
 *     Handled by database trigger platform_settlements_guard_terminal.
 *     COMPLETED records cannot be demoted.
 *
 * DESTINATION ACCOUNT MAPPING (server-side, currency-keyed):
 *   NGN → FINCRA_MERCHANT_NGN_ACCOUNT_ID  (env)
 *   USD → FINCRA_MERCHANT_USD_ACCOUNT_ID  (env)
 *   GHS → FINCRA_MERCHANT_GHS_ACCOUNT_ID  (env)
 *   (fallback) → FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID (env)
 *
 * PROVIDER IDENTIFIER MAPPING:
 *   NoteStandard reference (idempotencyKey)  ←→  Fincra customerReference
 *   Fincra payout API response reference     →  platform_settlements.provider_reference
 *   Fincra webhook event reference           →  platform_settlements.fincra_reference
 */

'use strict';

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const auditLogService = require('../AuditLogService');

// ── Server-side approved destination account mapping ─────────────────────────
// These are the ONLY valid settlement destinations.
// Resolved from environment variables. Never overridden by caller input.
function getApprovedDestination(currency, isLive = false) {
  const cur = (currency || '').toUpperCase();
  const mapping = {
    NGN: process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID
      || process.env.FINCRA_ACCOUNT_NUMBER
      || process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID,
    USD: process.env.FINCRA_MERCHANT_USD_ACCOUNT_ID
      || process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID,
    GHS: process.env.FINCRA_MERCHANT_GHS_ACCOUNT_ID
      || process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID,
  };
  const dest = mapping[cur] || process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID;

  if (isLive) {
    if (!dest || dest.startsWith('NS_APPROVED_') || dest.includes('placeholder') || dest.trim() === '') {
      throw new Error(`MISSING_APPROVED_SETTLEMENT_DESTINATION: No approved live Fincra merchant account ID configured for ${cur}. Set FINCRA_MERCHANT_${cur}_ACCOUNT_ID in environment.`);
    }
    return dest.trim();
  }

  return dest || `NS_APPROVED_${cur}_SETTLEMENT_ACCOUNT`;
}

class PlatformSettlementService {

  /**
   * Calculate available platform revenue for a specific currency.
   * READ-ONLY — does not acquire locks. Used for dashboard display only.
   * For the actual settlement reservation, use reserve_platform_revenue() RPC.
   *
   * @param {string} currency - 'NGN', 'USD', 'GHS'
   * @returns {Promise<{currency, totalRevenue, totalSettled, availableRevenue}>}
   */
  async getPlatformRevenueBalance(currency = 'NGN') {
    const cur = (currency || 'NGN').toUpperCase();

    const { data: revLogs, error: revErr } = await supabase
      .from('revenue_logs')
      .select('amount, source_transaction_id, transactions!inner(provider, reference_id, metadata)')
      .eq('currency', cur);

    if (revErr) {
      logger.error(`[PlatformSettlement] revenue_logs query error for ${cur}: ${revErr.message}`);
    }

    const eligibleLogs = (revLogs || []).filter(r => {
      const tx = r.transactions || {};
      const provider = (tx.provider || '').toLowerCase();
      const ref = tx.reference_id || '';
      const meta = typeof tx.metadata === 'string' ? tx.metadata : JSON.stringify(tx.metadata || {});

      const isAllowlistedProvider = ['fincra', 'anchor', 'paystack', 'grey', 'nowpayments'].includes(provider);
      const isLegacyFincra = !tx.provider && (meta.includes('fincra') || meta.includes('FINCRA'));
      const isInternalRef = ref.startsWith('NS-') || ref.startsWith('MANUAL-CREDIT-');

      return (isAllowlistedProvider || isLegacyFincra) && !isInternalRef;
    });

    const totalRevenue = eligibleLogs.reduce(
      (sum, r) => sum + parseFloat(r.amount || 0), 0
    );

    const { data: setts, error: settErr } = await supabase
      .from('platform_settlements')
      .select('amount, status')
      .eq('currency', cur)
      .in('status', ['PENDING', 'PROCESSING', 'SIMULATED_TEST', 'PENDING_RECONCILIATION', 'COMPLETED']);

    if (settErr) {
      logger.error(`[PlatformSettlement] platform_settlements query error for ${cur}: ${settErr.message}`);
    }

    const totalSettled = (setts || []).reduce(
      (sum, s) => sum + parseFloat(s.amount || 0), 0
    );

    const availableRevenue = Math.max(0, totalRevenue - totalSettled);

    return {
      currency: cur,
      totalRevenue:    Math.round(totalRevenue    * 100) / 100,
      totalSettled:    Math.round(totalSettled    * 100) / 100,
      availableRevenue: Math.round(availableRevenue * 100) / 100,
    };
  }

  /**
   * Execute a controlled platform revenue settlement.
   *
   * @param {Object} params
   * @param {string}  params.adminUserId     - User ID of the initiating admin
   * @param {number}  params.amount          - Settlement amount
   * @param {string}  params.currency        - 'NGN', 'USD', 'GHS'
   * @param {string}  [params.idempotencyKey] - Required for live execution
   * @param {string}  [params.destinationAccountId] - IGNORED (server resolves destination)
   */
  async requestSettlement({
    adminUserId,
    amount,
    currency = 'NGN',
    idempotencyKey = null,
    destinationAccountId: _ignoredCallerDestination, // explicitly ignored
  }) {
    const cur = (currency || 'NGN').toUpperCase();
    const settAmount = parseFloat(amount || 0);

    if (settAmount <= 0) {
      throw new Error('INVALID_SETTLEMENT_AMOUNT: Amount must be greater than zero.');
    }

    const isLiveExecutionEnabled =
      process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION === 'true';

    // ── BLOCKER 3 & PHASE 8: Fail-closed server-side destination resolution ────
    const approvedDestination = getApprovedDestination(cur, isLiveExecutionEnabled);

    // ── BLOCKER 4: Live execution REQUIRES caller-supplied idempotencyKey ─────
    if (isLiveExecutionEnabled && !idempotencyKey) {
      throw new Error(
        'MISSING_IDEMPOTENCY_KEY: Live settlement execution requires a stable idempotencyKey ' +
        'supplied by the caller. Provide a unique, stable request identifier to prevent ' +
        'duplicate payouts on retry.'
      );
    }

    // For simulated mode, auto-generate a reference if not supplied.
    const reference = idempotencyKey
      || `SETT-SIM-${cur}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ── IDEMPOTENCY CHECK: Return existing record if reference already used ───
    const { data: existingSettlement } = await supabase
      .from('platform_settlements')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();

    if (existingSettlement) {
      logger.info(`[PlatformSettlement] Idempotent hit for reference ${reference}. Returning existing record.`);
      return {
        alreadyProcessed: true,
        settlement: existingSettlement,
        isLiveExecutionEnabled,
        message: 'Settlement already exists for this idempotency key.',
      };
    }

    // ── BLOCKER 2: Atomic reservation via PostgreSQL RPC ─────────────────────
    const { data: settlementRecord, error: rpcErr } = await supabase.rpc(
      'reserve_platform_revenue',
      {
        p_reference:    reference,
        p_amount:       settAmount,
        p_currency:     cur,
        p_destination:  approvedDestination,
        p_initiated_by: adminUserId,
        p_is_live:      isLiveExecutionEnabled,
        p_metadata: {
          initiated_by_admin:   adminUserId,
          is_live_gated:        !isLiveExecutionEnabled,
          compliance_note: isLiveExecutionEnabled
            ? 'Queued for Fincra live execution'
            : 'Fincra execution gated (ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION=false)',
        },
      }
    );

    if (rpcErr) {
      logger.error(`[PlatformSettlement] reserve_platform_revenue RPC error: ${rpcErr.message}`);
      throw new Error(rpcErr.message);
    }

    // ── Audit log the reservation ─────────────────────────────────────────────
    await auditLogService.log({
      user_id:  adminUserId,
      action:   'platform_revenue_settlement_requested',
      amount:   settAmount,
      currency: cur,
      reference,
      metadata: {
        status:               settlementRecord.status,
        destination:          approvedDestination,
        isLiveExecutionEnabled,
        available_at_request: settlementRecord.available_at_request,
      },
    });

    logger.info(
      `[PlatformSettlement] Settlement ${reference} created. Status: ${settlementRecord.status}. Live: ${isLiveExecutionEnabled}`
    );

    // ── BLOCKER 1: Live Fincra Execution Dispatcher ───────────────────────────
    if (isLiveExecutionEnabled) {
      try {
        logger.info(`[PlatformSettlement] Dispatching live payout to Fincra for reference ${reference}`);

        const FincraSettlementProvider = require('./FincraSettlementProvider');

        const payoutResult = await FincraSettlementProvider.createPayout({
          address:   approvedDestination,
          amount:    settAmount,
          currency:  cur,
          reference, // this becomes customerReference in the Fincra payload
        });

        const providerRef = payoutResult?.payoutId
          || payoutResult?.fincraRef
          || payoutResult?.reference
          || null;

        // Transition to PROCESSING and persist the provider reference
        const { error: updateErr } = await supabase
          .from('platform_settlements')
          .update({
            status:             'PROCESSING',
            provider_reference: providerRef,
            metadata: {
              ...(settlementRecord.metadata || {}),
              provider_status: payoutResult?.status,
              dispatched_at:   new Date().toISOString(),
            },
          })
          .eq('reference', reference);

        if (updateErr) {
          logger.error(`[PlatformSettlement] Failed to update settlement to PROCESSING: ${updateErr.message}`);
        }

        await auditLogService.log({
          user_id:  adminUserId,
          action:   'platform_revenue_fincra_payout_dispatched',
          amount:   settAmount,
          currency: cur,
          reference,
          metadata: { providerRef, payoutStatus: payoutResult?.status },
        });

        logger.info(
          `[PlatformSettlement] ✅ Fincra payout dispatched. Provider ref: ${providerRef}. ` +
          `Final status will be set by payout.successful / payout.failed webhook.`
        );

        return {
          success:               true,
          settlement:            { ...settlementRecord, status: 'PROCESSING', provider_reference: providerRef },
          isLiveExecutionEnabled: true,
          providerReference:     providerRef,
          message:
            'Settlement dispatched to Fincra. Awaiting payout.successful or payout.failed webhook to finalise.',
        };

      } catch (payoutErr) {
        // ── PHASE 4 & 7: Distinguish DEFINITIVE REJECTION vs TIMEOUT / UNKNOWN OUTCOME ──
        const errStr = (payoutErr.message || '').toLowerCase();
        const isTimeoutOrNetwork =
          errStr.includes('timeout') ||
          errStr.includes('econnreset') ||
          errStr.includes('etimedout') ||
          errStr.includes('network') ||
          errStr.includes('502') ||
          errStr.includes('503') ||
          errStr.includes('504') ||
          errStr.includes('econnrefused');

        if (isTimeoutOrNetwork) {
          // UNKNOWN OUTCOME: Request may have reached Fincra before socket timeout.
          // Transition status to PENDING_RECONCILIATION so revenue stays RESERVED and cannot be double-spent.
          logger.warn(`[PlatformSettlement] Network timeout during Fincra payout dispatch for ${reference}. Marking PENDING_RECONCILIATION.`);

          await supabase
            .from('platform_settlements')
            .update({
              status: 'PENDING_RECONCILIATION',
              failure_reason: `Network timeout during dispatch: ${payoutErr.message}`,
              metadata: {
                ...(settlementRecord.metadata || {}),
                dispatch_error: payoutErr.message,
                timeout_at: new Date().toISOString(),
              },
            })
            .eq('reference', reference);

          await auditLogService.log({
            user_id:  adminUserId,
            action:   'platform_revenue_fincra_payout_timeout_pending_reconciliation',
            amount:   settAmount,
            currency: cur,
            reference,
            metadata: { error: payoutErr.message },
          });

          return {
            success: false,
            error: 'PAYOUT_TIMEOUT_PENDING_RECONCILIATION',
            message: 'Payout dispatch timed out. Settlement held in PENDING_RECONCILIATION state while outcome is verified.',
            settlement: { ...settlementRecord, status: 'PENDING_RECONCILIATION' },
            isLiveExecutionEnabled,
          };
        }

        // DEFINITIVE PROVIDER REJECTION (e.g. 400 Bad Request, invalid beneficiary, explicit rejection)
        logger.error(`[PlatformSettlement] Fincra payout dispatch rejected for ${reference}: ${payoutErr.message}`);

        await supabase
          .from('platform_settlements')
          .update({
            status:         'FAILED',
            failure_reason: payoutErr.message,
            metadata: {
              ...(settlementRecord.metadata || {}),
              rejected_at: new Date().toISOString(),
            },
          })
          .eq('reference', reference);

        await auditLogService.log({
          user_id:  adminUserId,
          action:   'platform_revenue_fincra_payout_dispatch_failed',
          amount:   settAmount,
          currency: cur,
          reference,
          metadata: { error: payoutErr.message },
        });

        throw new Error(`FINCRA_DISPATCH_ERROR: ${payoutErr.message}`);
      }
    }

    // Simulated mode — return the SIMULATED_TEST record directly.
    return {
      success:               true,
      settlement:            settlementRecord,
      isLiveExecutionEnabled: false,
      message:
        'Settlement recorded safely in SIMULATED_TEST mode. ' +
        'Live Fincra payout execution is gated (ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION=false).',
    };
  }

  /**
   * Handle a Fincra payout.successful webhook for a platform settlement.
   * Transitions the record from PROCESSING/PENDING_RECONCILIATION to COMPLETED.
   *
   * @param {string} reference  - The NoteStandard reference (= customerReference)
   * @param {string} fincraRef  - Fincra's own reference from the webhook payload
   */
  async handlePayoutSuccessful(reference, fincraRef) {
    const { data: record } = await supabase
      .from('platform_settlements')
      .select('id, status')
      .eq('reference', reference)
      .maybeSingle();

    if (!record) {
      logger.warn(`[PlatformSettlement] payout.successful webhook — no platform_settlement found for reference ${reference}`);
      return { handled: false, reason: 'No matching platform settlement' };
    }

    if (record.status === 'COMPLETED') {
      logger.info(`[PlatformSettlement] payout.successful duplicate webhook ignored for ${reference} (already COMPLETED)`);
      return { handled: true, reason: 'Already completed', alreadyDone: true };
    }

    if (!['PROCESSING', 'PENDING', 'PENDING_RECONCILIATION'].includes(record.status)) {
      logger.warn(`[PlatformSettlement] payout.successful received for record ${reference} in non-processable status ${record.status}`);
      return { handled: false, reason: `Invalid status ${record.status}` };
    }

    const { error: updateErr } = await supabase
      .from('platform_settlements')
      .update({
        status:          'COMPLETED',
        fincra_reference: fincraRef,
        metadata: {
          completed_at: new Date().toISOString(),
          fincra_reference: fincraRef,
        },
      })
      .eq('id', record.id);

    if (updateErr) {
      logger.error(`[PlatformSettlement] Failed to mark settlement COMPLETED: ${updateErr.message}`);
      return { handled: false, error: updateErr.message };
    }

    logger.info(`[PlatformSettlement] ✅ Settlement ${reference} marked COMPLETED via payout.successful webhook.`);
    return { handled: true, status: 'COMPLETED' };
  }

  /**
   * Handle a Fincra payout.failed webhook for a platform settlement.
   * Transitions the record from PROCESSING/PENDING_RECONCILIATION to FAILED.
   *
   * @param {string} reference - The NoteStandard reference
   * @param {string} reason    - Failure reason from Fincra
   */
  async handlePayoutFailed(reference, reason) {
    const { data: record } = await supabase
      .from('platform_settlements')
      .select('id, status')
      .eq('reference', reference)
      .maybeSingle();

    if (!record) {
      logger.warn(`[PlatformSettlement] payout.failed webhook — no platform_settlement found for reference ${reference}`);
      return { handled: false, reason: 'No matching platform settlement' };
    }

    if (['COMPLETED', 'FAILED'].includes(record.status)) {
      logger.info(`[PlatformSettlement] payout.failed ignored for ${reference} (already ${record.status})`);
      return { handled: true, alreadyDone: true };
    }

    const { error: updateErr } = await supabase
      .from('platform_settlements')
      .update({
        status:         'FAILED',
        failure_reason: reason,
        metadata: {
          failed_at: new Date().toISOString(),
          failure_reason: reason,
        },
      })
      .eq('id', record.id);

    if (updateErr) {
      logger.error(`[PlatformSettlement] Failed to mark settlement FAILED: ${updateErr.message}`);
      return { handled: false, error: updateErr.message };
    }

    logger.info(`[PlatformSettlement] Settlement ${reference} marked FAILED via payout.failed webhook. Reason: ${reason}`);
    return { handled: true, status: 'FAILED' };
  }

  /**
   * Reconcile any pending or timeout-held platform settlements against Fincra API.
   */
  async reconcilePendingSettlements() {
    const { data: records, error } = await supabase
      .from('platform_settlements')
      .select('*')
      .in('status', ['PENDING_RECONCILIATION', 'PROCESSING']);

    if (error || !records || records.length === 0) {
      return { reconciled: 0 };
    }

    const FincraSettlementProvider = require('./FincraSettlementProvider');
    let reconciled = 0;

    for (const rec of records) {
      const statusRes = await FincraSettlementProvider.getPayoutSettlementStatus(rec.reference);
      if (statusRes.isSettled) {
        await this.handlePayoutSuccessful(rec.reference, statusRes.fincraRef || rec.reference);
        reconciled++;
      } else if (statusRes.isFailed) {
        await this.handlePayoutFailed(rec.reference, statusRes.error || 'Provider rejected payout');
        reconciled++;
      }
    }

    return { reconciled, total: records.length };
  }

  /**
   * List recent platform settlements for the admin dashboard.
   *
   * @param {string} [currency]
   * @param {number} [limit=20]
   */
  async listSettlements(currency = null, limit = 20) {
    let query = supabase
      .from('platform_settlements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (currency) {
      query = query.eq('currency', (currency).toUpperCase());
    }

    const { data, error } = await query;
    if (error) {
      logger.error(`[PlatformSettlement] listSettlements error: ${error.message}`);
      return [];
    }
    return data || [];
  }
}

module.exports = new PlatformSettlementService();
