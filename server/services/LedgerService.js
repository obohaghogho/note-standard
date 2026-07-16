const supabase = require("../config/database");
const validator = require("./LedgerValidator");
const logger = require("../utils/logger");

/**
 * Ledger Service (The Sentinel Core)
 * The absolute entrance for all financial state changes.
 */
class LedgerService {
  /**
   * Commit an atomic financial event to the ledger.
   * 
   * @param {Object} intent 
   * {
   *   idempotencyKey: string,
   *   type: 'SWAP' | 'TRANSFER' | 'WITHDRAWAL' | 'NORMALIZATION',
   *   entries: Array<{wallet_id, user_id, currency, amount, side}>,
   *   metadata: Object,
   *   status: 'PENDING' | 'SETTLED'
   * }
   */
  async commitAtomicEvent(intent) {
    const { idempotencyKey, type, entries, metadata = {}, status = 'SETTLED' } = intent;

    logger.info(`[LedgerService] Initiating commit for Event:${idempotencyKey} Type:${type}`);

    try {
      // 1. Layer A Protection: Application-level validation
      validator.validateBalancedSet(entries);
      validator.validateCurrencyAlignment(entries, type);

      // 2. Layer B Protection: Atomic Database RPC
      const { data: txId, error } = await supabase.rpc('execute_ledger_transaction_v6', {
        p_idempotency_key: idempotencyKey,
        p_type: type,
        p_status: status,
        p_metadata: metadata,
        p_entries: entries
      });

      if (error) {
        logger.error(`[LedgerService] RPC Failure for Event:${idempotencyKey}`, error);
        throw new Error(`LEDGER_COMMIT_FAILURE: ${error.message}`);
      }

      logger.info(`[LedgerService] SUCCESS: Event:${idempotencyKey} committed as Tx:${txId}`);
      return txId;

    } catch (err) {
      logger.error(`[LedgerService] CRITICAL FAILURE for Event:${idempotencyKey}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Forensic Helper: Get reconciled balance (sum of journal)
   */
  async getReconciledBalance(walletId) {
    const { data, error } = await supabase
      .from('wallets_v6')
      .select('balance')
      .eq('id', walletId)
      .single();
      
    if (error) throw error;
    return data.balance;
  }
}

module.exports = new LedgerService();
