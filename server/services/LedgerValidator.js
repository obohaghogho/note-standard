const math = require("../utils/mathUtils");
const logger = require("../utils/logger");

/**
 * Ledger Validator (Layer A Sentinel)
 * Responsible for pre-commit verification of financial invariants.
 */
class LedgerValidator {
  /**
   * Enforce Σ debits = Σ credits
   */
  validateBalancedSet(entries) {
    if (!entries || entries.length < 2) {
      throw new Error("INVARIANT_VIOLATION: Transaction must have at least 2 entries.");
    }

    let sum = math.parseSafe(0);
    entries.forEach((entry) => {
      const amount = math.parseSafe(entry.amount);
      
      // Side consistency check
      if (entry.side === 'CREDIT' && !math.isGreaterOrEqual(entry.amount, 0)) {
        throw new Error(`INVARIANT_VIOLATION: Credit entry for wallet ${entry.wallet_id} has negative amount.`);
      }
      if (entry.side === 'DEBIT' && math.isGreaterOrEqual(entry.amount, 0)) {
        // Technically 0 is neutral but should generally be blocked for debits
        if (math.isEqual(entry.amount, 0)) {
           throw new Error(`INVARIANT_VIOLATION: Debit entry for wallet ${entry.wallet_id} has zero amount.`);
        }
        throw new Error(`INVARIANT_VIOLATION: Debit entry for wallet ${entry.wallet_id} has positive amount.`);
      }

      sum = sum + amount;
    });

    if (!math.isEqual(math.formatSafe(sum), 0)) {
      throw new Error(`INVARIANT_VIOLATION: Transaction set is unbalanced. SUM = ${math.formatSafe(sum)}`);
    }

    return true;
  }

  /**
   * Enforce currency consistency for single-asset events (Transfers/Withdrawals)
   * Note: Swaps are exempt from single-currency check but must have paired logic.
   */
  validateCurrencyAlignment(entries, type) {
    if (['transfer', 'withdrawal', 'deposit', 'fee', 'normalization'].includes(type.toLowerCase())) {
      const primaryCurrency = entries[0].currency;
      const mismatch = entries.find(e => e.currency !== primaryCurrency);
      if (mismatch) {
        throw new Error(`INVARIANT_VIOLATION: Currency mismatch in ${type} event. Expected ${primaryCurrency}, found ${mismatch.currency}`);
      }
    }
    return true;
  }
}

module.exports = new LedgerValidator();
