'use strict';
/**
 * OrchestratorBridge.js
 * =====================
 * Feature-flagged migration shim.
 *
 * Sits between existing controllers and the FinancialOrchestrator.
 * Every operation checks its per-flow env flag:
 *   - Flag ON  → routes through FinancialOrchestrator (CFO pipeline)
 *   - Flag OFF → falls through to existing service (zero behaviour change)
 *
 * Per-flow flags (default: all false = existing behaviour preserved):
 *   MIGRATE_DEPOSITS=true
 *   MIGRATE_PAYOUTS=true
 *   MIGRATE_SWAPS=true
 *   MIGRATE_REFUNDS=true
 *   MIGRATE_TRANSFERS=true
 *
 * Rollback is instantaneous — set flag to false, no redeploy needed.
 *
 * @module services/orchestration/OrchestratorBridge
 */

const logger = require('../../utils/logger');

// Lazy loads to prevent circular dependencies
const _cfo        = () => require('./FinancialOrchestrator');
const _paymentSvc = () => require('../payment/paymentService');
const _payoutSvc  = () => require('../payment/payoutService');
const _swapSvc    = () => require('../swapService');
const _orch       = () => require('../payment/PaymentOrchestrator');

/** Read a boolean env flag (default: false) */
function flag(name) {
  return process.env[name] === 'true';
}

const OrchestratorBridge = {
  // ── Deposits ───────────────────────────────────────────────────────────────

  /**
   * Initialize a deposit / payment intent.
   * Called by: walletController.deposit(), paymentController.initialize()
   *
   * @param {Object} params
   * @param {string}  params.userId
   * @param {string}  params.email
   * @param {number}  params.amount
   * @param {string}  params.currency
   * @param {string}  [params.method]
   * @param {string}  [params.idempotencyKey]
   * @param {string}  [params.callbackUrl]
   * @param {Object}  [params.metadata]
   * @param {string}  [params.countryCode]
   * @param {string}  [params.quoteId]
   */
  async deposit(params) {
    if (flag('MIGRATE_DEPOSITS')) {
      logger.info(`[OrchestratorBridge] DEPOSIT → CFO | userId=${params.userId}`);
      return _cfo().execute({
        operationType: 'DEPOSIT',
        userId:        params.userId,
        currency:      params.currency,
        amount:        params.amount,
        method:        params.method || 'card',
        idempotencyKey: params.idempotencyKey,
        countryCode:   params.countryCode,
        providerParams: {
          email:       params.email,
          callbackUrl: params.callbackUrl,
          quoteId:     params.quoteId,
        },
        metadata:      params.metadata || {},
      });
    }

    // ── Legacy path (unchanged) ───────────────────────────────────────────────
    logger.debug(`[OrchestratorBridge] DEPOSIT → Legacy paymentService | userId=${params.userId}`);
    return _paymentSvc().initializePayment(
      params.userId,
      params.email,
      params.amount,
      params.currency,
      params.metadata || {},
      { provider: params.provider, ...(params.options || {}) }
    );
  },

  // ── Payouts / Withdrawals ──────────────────────────────────────────────────

  /**
   * Initiate a payout / bank transfer withdrawal.
   * Called by: payoutService callers, walletController.withdraw()
   *
   * @param {Object} params
   * @param {string}  params.userId
   * @param {number}  params.amount
   * @param {string}  params.currency
   * @param {string}  [params.method]        bank_transfer | crypto | etc.
   * @param {Object}  [params.bankDetails]   { bankCode, accountNumber, accountName }
   * @param {string}  [params.idempotencyKey]
   * @param {Object}  [params.metadata]
   * @param {string}  [params.countryCode]
   */
  async payout(params) {
    if (flag('MIGRATE_PAYOUTS')) {
      logger.info(`[OrchestratorBridge] PAYOUT → CFO | userId=${params.userId} | ${params.amount} ${params.currency}`);
      return _cfo().execute({
        operationType:  'PAYOUT',
        userId:         params.userId,
        currency:       params.currency,
        amount:         params.amount,
        method:         params.method || 'bank_transfer',
        idempotencyKey: params.idempotencyKey,
        countryCode:    params.countryCode,
        providerParams: {
          bankCode:      params.bankDetails?.bankCode,
          accountNumber: params.bankDetails?.accountNumber,
          accountName:   params.bankDetails?.accountName,
          narration:     params.narration || 'Withdrawal',
        },
        metadata: params.metadata || {},
      });
    }

    // ── Legacy path ───────────────────────────────────────────────────────────
    logger.debug(`[OrchestratorBridge] PAYOUT → Legacy payoutService | userId=${params.userId}`);
    return _orch().processWithdrawalIntent({
      userId:         params.userId,
      amount:         params.amount,
      currency:       params.currency,
      bankDetails:    params.bankDetails,
      idempotencyKey: params.idempotencyKey,
    });
  },

  // ── Internal Transfers (wallet-to-wallet, user-to-user) ───────────────────

  /**
   * Internal platform transfer.
   * Called by: transfer service callers
   */
  async transfer(params) {
    if (flag('MIGRATE_TRANSFERS')) {
      logger.info(`[OrchestratorBridge] TRANSFER → CFO | userId=${params.userId}`);
      return _cfo().execute({
        operationType:  'WITHDRAWAL',  // Internal transfers use WITHDRAWAL type
        userId:         params.userId,
        currency:       params.currency,
        amount:         params.amount,
        method:         'internal_transfer',
        idempotencyKey: params.idempotencyKey,
        providerParams: {
          recipientUserId: params.recipientUserId,
          note:            params.note,
        },
        metadata: { ...(params.metadata || {}), isInternalTransfer: true },
      });
    }

    // ── Legacy path ───────────────────────────────────────────────────────────
    const TransferService = require('../TransferService');
    return TransferService.transfer(params);
  },

  // ── Swaps ──────────────────────────────────────────────────────────────────

  /**
   * Execute a currency swap (requires pre-computed lockId from preview).
   * Called by: swapController.execute()
   *
   * @param {Object} params
   * @param {string}  params.userId
   * @param {string}  params.lockId
   * @param {string}  [params.idempotencyKey]
   * @param {string}  params.fromCurrency
   * @param {string}  params.toCurrency
   * @param {number}  params.amount
   */
  async swap(params) {
    if (flag('MIGRATE_SWAPS')) {
      logger.info(`[OrchestratorBridge] SWAP → CFO | userId=${params.userId} | ${params.fromCurrency}→${params.toCurrency}`);
      return _cfo().execute({
        operationType:  'SWAP',
        userId:         params.userId,
        currency:       params.fromCurrency,
        amount:         params.amount,
        method:         'swap',
        idempotencyKey: params.idempotencyKey,
        providerParams: {
          toCurrency: params.toCurrency,
          lockId:     params.lockId,
        },
        metadata: params.metadata || {},
      });
    }

    // ── Legacy path ───────────────────────────────────────────────────────────
    logger.debug(`[OrchestratorBridge] SWAP → Legacy swapService | userId=${params.userId}`);
    return _swapSvc().executeSwap(params.userId, params.lockId, params.idempotencyKey);
  },

  // ── Refunds ────────────────────────────────────────────────────────────────

  /**
   * Issue a refund against an original transaction reference.
   * Called by: admin controllers
   */
  async refund(params) {
    if (flag('MIGRATE_REFUNDS')) {
      logger.info(`[OrchestratorBridge] REFUND → CFO | ref=${params.reference}`);
      return _cfo().execute({
        operationType:  'REFUND',
        userId:         params.requestedBy || 'ADMIN',
        currency:       params.currency || 'NGN',
        amount:         params.amount || 0,
        method:         'refund',
        idempotencyKey: `refund_${params.reference}`,
        providerParams: {
          reference: params.reference,
          reason:    params.reason,
        },
        metadata: { requestedBy: params.requestedBy },
      });
    }

    // ── Legacy path ───────────────────────────────────────────────────────────
    return _orch().refundPayment({
      reference:   params.reference,
      reason:      params.reason,
      requestedBy: params.requestedBy,
    });
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  /**
   * Returns the current migration state for all flows.
   * Useful for admin diagnostics.
   */
  getMigrationStatus() {
    return {
      deposits:  flag('MIGRATE_DEPOSITS'),
      payouts:   flag('MIGRATE_PAYOUTS'),
      transfers: flag('MIGRATE_TRANSFERS'),
      swaps:     flag('MIGRATE_SWAPS'),
      refunds:   flag('MIGRATE_REFUNDS'),
      cfoActive: flag('MIGRATE_DEPOSITS') || flag('MIGRATE_PAYOUTS') || flag('MIGRATE_SWAPS'),
    };
  },
};

module.exports = OrchestratorBridge;
