const supabase = require('../config/database');
const SettlementEngine = require('../services/payment/SettlementEngine');
const logger = require('../utils/logger');

let intervalId = null;
const RUN_INTERVAL = 2 * 60 * 1000; // 2 minutes

/**
 * Settlement Worker
 * Periodically scans for transactions in PENDING_SETTLEMENT or SETTLEMENT_CONFIRMED states.
 * Promotes them to the next maturity state based on region-specific rules.
 */
class SettlementWorker {
    static start() {
        if (intervalId) return;
        logger.info("[SettlementWorker] Monitoring bank settlement cycles...");
        intervalId = setInterval(() => this.processSettlements(), RUN_INTERVAL);
        setTimeout(() => this.processSettlements(), 30000); // Initial run
    }

    static async processSettlements() {
        try {
            // 1. Fetch transactions requiring maturity check
            const { data: pendingTxs, error } = await supabase
                .from('transactions')
                .select('id, settlement_status')
                .in('settlement_status', ['PENDING_SETTLEMENT', 'SETTLEMENT_CONFIRMED'])
                .limit(100);

            if (error) throw error;
            if (!pendingTxs || pendingTxs.length === 0) return;

            logger.info(`[SettlementWorker] Reviewing ${pendingTxs.length} transactions for settlement maturity...`);

            for (const tx of pendingTxs) {
                const { canFinalize, reason } = await SettlementEngine.canFinalizeSettlement(tx.id);

                if (canFinalize) {
                    if (tx.settlement_status === 'PENDING_SETTLEMENT') {
                        // First promotion: To CONFIRMED
                        await SettlementEngine.confirmSettlement(tx.id);
                    } else if (tx.settlement_status === 'SETTLEMENT_CONFIRMED') {
                        // Final promotion: To FINALIZED_LEDGER
                        await SettlementEngine.finalize(tx.id);
                    }
                } else {
                    // Log only if it's not simply 'window still open' to avoid spam
                    if (reason !== 'Settlement window still open') {
                        logger.debug(`[SettlementWorker] Tx ${tx.id} held in ${tx.settlement_status}: ${reason}`);
                    }
                }
            }
        } catch (err) {
            logger.error("[SettlementWorker] Maturity scanning cycle failed:", err.message);
        }
    }
}

module.exports = SettlementWorker;
