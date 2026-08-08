/**
 * WithdrawalReconciliationWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal, Currency-Agnostic Background Withdrawal Reconciliation Worker.
 *
 * ARCHITECTURE:
 * - Operates uniformly across ALL currencies (NGN, USD, EUR, GBP, TZS, CAD, ZAR, etc.).
 * - Queries active provider adapters via ProviderRegistry.
 * - Implements AUTOMATIC RECOVERY FIRST -> EXCEPTION QUEUE SECOND:
 *   1. Provider SUCCESS -> Idempotent Settlement (funds_status: DEBITED, withdrawal_status: COMPLETED)
 *   2. Provider FAILED  -> Idempotent Reversal   (funds_status: RELEASED, withdrawal_status: REVERSED)
 *   3. Provider UNKNOWN or Timeout (>15 min) -> Flag reconciliation_status: WITHDRAWAL_STUCK
 */

const supabase = require("../config/database");
const logger = require("../utils/logger");
const IdempotentWithdrawalSettlementService = require("../services/payment/IdempotentWithdrawalSettlementService");

class WithdrawalReconciliationWorker {
  constructor() {
    this.intervalMs = 60000; // Run every 60 seconds
    this.isProcessing = false;
    this.timer = null;
  }

  start() {
    logger.info("[WithdrawalReconciliationWorker] 🚀 Starting Universal Withdrawal Reconciliation Engine...");
    this.timer = setInterval(() => this.runCycle(), this.intervalMs);
    // Run initial cycle immediately
    setTimeout(() => this.runCycle(), 2000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Fetch pending/stuck withdrawals across ALL currencies
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: pendingTxs, error } = await supabase
        .from("fincra_transactions")
        .select("*")
        .eq("type", "WITHDRAWAL")
        .or("withdrawal_status.in.(PROCESSING,PENDING_REVIEW,SENT_TO_PROVIDER),funds_status.eq.RESERVED")
        .neq("withdrawal_status", "COMPLETED")
        .lt("created_at", fiveMinsAgo)
        .limit(100);

      if (error) {
        logger.error(`[WithdrawalReconciliationWorker] Error fetching pending payouts: ${error.message}`);
        return;
      }

      if (!pendingTxs || pendingTxs.length === 0) {
        return;
      }

      logger.info(`[WithdrawalReconciliationWorker] Found ${pendingTxs.length} pending/stuck withdrawals across currencies. Processing...`);

      for (const tx of pendingTxs) {
        await this.reconcileWithdrawal(tx);
      }
    } catch (cycleErr) {
      logger.error(`[WithdrawalReconciliationWorker] Cycle error: ${cycleErr.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  async reconcileWithdrawal(tx) {
    const ref = tx.reference || tx.withdrawal_reference;
    const currency = (tx.currency || "NGN").toUpperCase();

    logger.info(`[WithdrawalReconciliationWorker] Reconciling withdrawal ${tx.id} (${currency} ${tx.amount}, Ref: ${ref})`);

    try {
      // 2. Fetch Provider Adapter via ProviderRegistry
      const { registry } = require("../providers/PayoutProvider");
      const FincraProvider = require("../providers/fincraProvider");
      try { registry.register(new FincraProvider()); } catch (e) {}
      const provider = registry.getPrimary();

      let verifyRes = null;
      try {
        verifyRes = await provider.verifyPayout(ref);
      } catch (pErr) {
        logger.warn(`[WithdrawalReconciliationWorker] Provider verify query warning for ref ${ref}: ${pErr.message}`);
      }

      const providerStatus = String(verifyRes?.status || verifyRes?.rawResponse?.data?.status || "UNKNOWN").toUpperCase();

      // 3. AUTOMATIC RECOVERY PATH
      if (["SUCCESSFUL", "SUCCESS", "SETTLED", "COMPLETED"].includes(providerStatus)) {
        logger.info(`[WithdrawalReconciliationWorker] Provider SUCCESS verified for tx ${tx.id} (${ref}). Finalizing settlement...`);

        const res = await IdempotentWithdrawalSettlementService.finalizeSettlement({
          transactionId: tx.id,
          reference: ref,
          providerTransactionId: verifyRes?.rawResponse?.data?.reference || tx.fincra_reference,
          userId: tx.user_id,
          currency,
          amount: tx.amount,
          fee: tx.fee || 0,
          source: "UNIVERSAL_RECONCILIATION_WORKER",
        });

        if (res.success) {
          logger.info(`[WithdrawalReconciliationWorker] ✅ AUTO-SETTLEMENT SUCCESSFUL for ${ref}`);
        }
        return;
      }

      if (["FAILED", "REJECTED", "CANCELLED"].includes(providerStatus)) {
        logger.info(`[WithdrawalReconciliationWorker] Provider FAILED verified for tx ${tx.id} (${ref}). Reversing fund reservation...`);

        const res = await IdempotentWithdrawalSettlementService.reverseReservation({
          transactionId: tx.id,
          reference: ref,
          userId: tx.user_id,
          currency,
          amount: tx.amount,
          fee: tx.fee || 0,
          reason: `Provider confirmed status: ${providerStatus}`,
          errorCode: "PROVIDER_REJECTED",
          source: "UNIVERSAL_RECONCILIATION_WORKER",
        });

        if (res.success) {
          logger.info(`[WithdrawalReconciliationWorker] ✅ AUTO-REVERSAL SUCCESSFUL for ${ref}`);
        }
        return;
      }

      // 4. EXCEPTION QUEUE ROUTING (If stuck > 15 mins or Provider UNKNOWN)
      const isStuck = new Date(tx.created_at) < new Date(Date.now() - 15 * 60 * 1000);

      if (isStuck || providerStatus === "UNKNOWN") {
        logger.warn(`[WithdrawalReconciliationWorker] ⚠️ Flagging tx ${tx.id} (${ref}) as WITHDRAWAL_STUCK for Admin Exception Queue`);

        await supabase
          .from("fincra_transactions")
          .update({
            reconciliation_status: "WITHDRAWAL_STUCK",
            provider_status: providerStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id);
      }
    } catch (err) {
      logger.error(`[WithdrawalReconciliationWorker] Failed to reconcile tx ${tx.id}: ${err.message}`);
    }
  }
}

module.exports = new WithdrawalReconciliationWorker();
