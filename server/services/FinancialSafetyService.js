const SystemState = require("../config/SystemState");
const logger = require("../utils/logger");
const { FINCRA_SUPPORTED_SET } = require("./fincra/constants");

// Build comprehensive currency allowlist from authoritative sources:
// 1. All Fincra-approved fiat currencies (NGN, USD, EUR, GBP, CAD, GHS, KES, etc.)
// 2. On-chain crypto currencies (BTC, ETH) — handled by NowPayments
// This replaces the previous hardcoded 6-currency list that silently blocked
// EUR, GBP, CAD, and all African/Asian currencies from ledger operations.
const ALLOWED_CURRENCIES = new Set([
  ...FINCRA_SUPPORTED_SET,  // All 21 Fincra fiat + stablecoin currencies
  'BTC', 'ETH',             // On-chain crypto (NowPayments custody)
]);

/**
 * Financial Safety Service
 * Provides global pre-execution validations for all financial operations.
 */
class FinancialSafetyService {
  /**
   * Validate a proposed transaction against global safety rules.
   * @param {Object} intent The transaction intent (as passed to LedgerService)
   */
  async validateIntent(intent) {
    logger.info(`[FinancialSafetyService] Validating intent: ${intent.idempotencyKey}`);

    // 1. Maintenance & System State Check
    if (SystemState.mode === "SAFE" || SystemState.mode === "RECOVERY") {
      throw new Error(`SYSTEM_MAINTENANCE: Transactions are temporarily halted (Mode: ${SystemState.mode})`);
    }

    if (['WITHDRAWAL', 'TRANSFER'].includes(intent.type) && !SystemState.isWithdrawalsEnabled()) {
      throw new Error(`SYSTEM_RESTRICTION: Withdrawals and transfers are currently disabled (Mode: ${SystemState.getWithdrawalMode()})`);
    }

    // 2. Currency Checks — uses FINCRA_SUPPORTED_SET + crypto for complete coverage
    for (const entry of intent.entries) {
      if (!ALLOWED_CURRENCIES.has(entry.currency.toUpperCase())) {
        throw new Error(`SAFETY_VIOLATION: Unsupported currency detected: ${entry.currency}`);
      }

      // 3. Frozen Wallet / Entity Check
      if (SystemState.isEntityFrozen(entry.user_id) || SystemState.isEntityFrozen(entry.wallet_id)) {
        throw new Error(`SAFETY_VIOLATION: Operation denied. Wallet or User ${entry.user_id} is frozen.`);
      }
      
      if (SystemState.isAssetFrozen(entry.currency)) {
        throw new Error(`SAFETY_VIOLATION: Asset ${entry.currency} is currently frozen system-wide.`);
      }

      // 4. Transaction Limits
      if (entry.side === 'CREDIT' && entry.currency === 'NGN') {
        const maxDeposit = SystemState.getTransactionLimit('maxDailyDepositNGN');
        if (entry.amount > maxDeposit) {
          throw new Error(`SAFETY_VIOLATION: Deposit amount ${entry.amount} exceeds dynamic limit ${maxDeposit}`);
        }
      }

      if (entry.side === 'DEBIT' && entry.currency === 'NGN' && entry.user_id !== 'SYSTEM') {
        const maxWithdrawal = SystemState.getTransactionLimit('maxSingleTransactionNGN');
        // Because debits are negative in our ledger format
        if (Math.abs(entry.amount) > maxWithdrawal) {
          throw new Error(`SAFETY_VIOLATION: Withdrawal amount ${Math.abs(entry.amount)} exceeds dynamic limit ${maxWithdrawal}`);
        }
      }
    }

    // 5. Unique Reference Validation (If provided)
    if (intent.metadata && intent.metadata.reference) {
       // Typically we would check the DB if this external reference was already processed, 
       // but idempotencyKey handles the exact atomic replay prevention.
       // The reference check is useful for preventing the same provider tx from being credited twice 
       // under different idempotency keys. We leave this logic to the webhook service which does it prior.
    }

    logger.info(`[FinancialSafetyService] Intent ${intent.idempotencyKey} passed safety validations.`);
    return true;
  }
}

module.exports = new FinancialSafetyService();
