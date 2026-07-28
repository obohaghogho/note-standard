/**
 * Enterprise Payout Reconciliation Worker
 * ─────────────────────────────────────────
 * Runs periodic reconciliation between NoteStandard fincra_transactions records
 * and Fincra API payout statuses to detect and auto-heal missing webhooks or mismatches.
 */

const supabase     = require("../config/database");
const { registry } = require("../providers/PayoutProvider");
const logger       = require("../utils/logger");

class ReconciliationWorker {
  constructor() {
    this.intervalId = null;
  }

  start(intervalMs = 300000) { // Every 5 minutes
    if (this.intervalId) return;
    logger.info("[ReconciliationWorker] ⚖️ Reconciliation Worker started.");
    this.intervalId = setInterval(() => this.runReconciliation(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("[ReconciliationWorker] Stopped.");
    }
  }

  async runReconciliation() {
    try {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: pendingTxs, error } = await supabase
        .from("fincra_transactions")
        .select("*")
        .in("status", ["RESERVED", "SENT_TO_PROVIDER", "PROCESSING"])
        .lte("created_at", tenMinsAgo)
        .limit(20);

      if (error || !pendingTxs || pendingTxs.length === 0) return;

      logger.info(`[ReconciliationWorker] Reconciling ${pendingTxs.length} pending payouts...`);

      const provider = registry.getPrimary();

      for (const tx of pendingTxs) {
        try {
          const verifyRes = await provider.verifyPayout(tx.reference);
          const extStatus = (verifyRes.status || "").toLowerCase();

          if (extStatus === "successful" || extStatus === "success") {
            logger.info(`[ReconciliationWorker] ✅ Auto-reconciling ${tx.reference} to SUCCESSFUL`);
            await supabase.rpc("finalize_enterprise_withdrawal", {
              p_withdrawal_ref: tx.reference,
              p_fincra_ref: verifyRes.rawResponse?.data?.reference || tx.fincra_reference,
              p_status: "SUCCESSFUL",
            });
          } else if (extStatus === "failed") {
            logger.warn(`[ReconciliationWorker] ❌ Auto-reconciling ${tx.reference} to REVERSED`);
            await supabase.rpc("finalize_enterprise_withdrawal", {
              p_withdrawal_ref: tx.reference,
              p_fincra_ref: tx.fincra_reference,
              p_status: "REVERSED",
              p_error_code: "RECONCILIATION_FAILED",
              p_error_message: "Provider confirmed transaction failed",
            });
          }
        } catch (vErr) {
          logger.warn(`[ReconciliationWorker] Reconciliation query failed for ${tx.reference}: ${vErr.message}`);
        }
      }
    } catch (err) {
      logger.error(`[ReconciliationWorker] Exception during reconciliation: ${err.message}`);
    }
  }
}

module.exports = new ReconciliationWorker();
