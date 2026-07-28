/**
 * Merchant Balance Auto-Synchronization Worker
 * ──────────────────────────────────────────────
 * Periodically (every 60 seconds) fetches Fincra merchant account balance,
 * stores historical snapshots in fincra_merchant_balance_logs, and raises low-balance alerts.
 */

const supabase     = require("../config/database");
const { registry } = require("../providers/PayoutProvider");
const logger       = require("../utils/logger");

const LOW_BALANCE_THRESHOLD_NGN = 500000; // ₦500,000 alert threshold

class MerchantBalanceWorker {
  constructor() {
    this.intervalId = null;
  }

  start(intervalMs = 60000) { // Every 60 seconds
    if (this.intervalId) return;
    logger.info("[MerchantBalanceWorker] 🏦 Merchant Balance Auto-Sync Worker started.");
    this.intervalId = setInterval(() => this.syncMerchantBalance(), intervalMs);
    // Run initial sync immediately
    this.syncMerchantBalance().catch(() => {});
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("[MerchantBalanceWorker] Stopped.");
    }
  }

  async syncMerchantBalance() {
    try {
      const provider = registry.getPrimary();
      const balData = await provider.getMerchantBalance("NGN");

      const available = parseFloat(balData.available || 0);

      // Persist snapshot in fincra_merchant_balance_logs
      await supabase.from("fincra_merchant_balance_logs").insert({
        currency:          balData.currency || "NGN",
        available_balance: available,
        pending_balance:   0,
        raw_response:      balData,
        created_at:        new Date().toISOString(),
      });

      if (available < LOW_BALANCE_THRESHOLD_NGN) {
        logger.warn(`[MerchantBalanceWorker] ⚠️ LOW MERCHANT RESERVE ALERT: Available balance is ${available} NGN (Threshold: ${LOW_BALANCE_THRESHOLD_NGN} NGN).`);
      } else {
        logger.info(`[MerchantBalanceWorker] 💰 Merchant Balance Snapshot: ${available} ${balData.currency}`);
      }
    } catch (err) {
      logger.warn(`[MerchantBalanceWorker] Sync warning: ${err.message}`);
    }
  }
}

module.exports = new MerchantBalanceWorker();
