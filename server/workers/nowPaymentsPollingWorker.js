const supabase = require("../config/database");
const logger = require("../utils/logger");
const nowpaymentsService = require("../services/nowpaymentsService");
const paymentService = require("../services/payment/paymentService");
const PaymentFactory = require("../services/payment/PaymentFactory");
const AuditLogService = require("../services/AuditLogService");

const RUN_INTERVAL = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_MINUTES = 15;

/**
 * NOWPayments Polling Worker
 * Recovers missed webhooks by polling the provider for stuck deposits/payouts.
 */
class NowPaymentsPollingWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.intervalId) return;
    logger.info("[NowPaymentsPollingWorker] Started autonomous polling for missed webhooks.");
    this.intervalId = setInterval(() => this.runCycle(), RUN_INTERVAL);
    setTimeout(() => this.runCycle(), 10000); // Initial run
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("[NowPaymentsPollingWorker] Stopped.");
    }
  }

  async runCycle() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.pollStuckDeposits();
      await this.pollStuckPayouts();
    } catch (error) {
      logger.error("[NowPaymentsPollingWorker] Cycle failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  async pollStuckDeposits() {
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60000).toISOString();
    const { data: deposits, error } = await supabase
      .from("transactions")
      .select("id, reference_id, provider_reference, currency, amount")
      .eq("provider", "nowpayments")
      .eq("status", "PENDING")
      .lte("created_at", staleTime)
      .limit(50);

    if (error || !deposits || deposits.length === 0) return;

    for (const tx of deposits) {
      try {
        const paymentId = tx.provider_reference || tx.reference_id;
        if (!paymentId) continue;

        const providerData = await nowpaymentsService.getPaymentStatus(paymentId);
        if (["finished", "confirmed"].includes(providerData.payment_status)) {
            await this.executeRecovery(tx.id, null, providerData, "deposit");
        } else if (["failed", "expired"].includes(providerData.payment_status)) {
           // Optionally mark as failed
           await supabase.from("transactions").update({ status: "FAILED" }).eq("id", tx.id);
        }
      } catch (err) {
        logger.warn(`[NowPaymentsPollingWorker] Failed to check deposit ${tx.id}: ${err.message}`);
      }
    }
  }

  async pollStuckPayouts() {
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60000).toISOString();
    const { data: payouts, error } = await supabase
      .from("payout_requests")
      .select("id, provider_reference, withdrawal_state")
      .in("withdrawal_state", ["PROCESSING", "SENT", "CONFIRMING"])
      .eq("provider", "nowpayments")
      .lte("updated_at", staleTime)
      .limit(50);

    if (error || !payouts || payouts.length === 0) return;

    for (const payout of payouts) {
      try {
        const paymentId = payout.provider_reference || payout.id;
        if (!paymentId) continue;

        // Payout status check from NOWPayments
        const providerData = await nowpaymentsService.getPaymentStatus(paymentId);
        
        // Use the same logic
        if (["finished", "confirmed"].includes(providerData.payment_status)) {
            await this.executeRecovery(null, payout.id, providerData, "payout");
        } else if (["failed", "expired"].includes(providerData.payment_status)) {
             await supabase.from("payout_requests").update({ withdrawal_state: "FAILED_FINAL" }).eq("id", payout.id);
             // Note: reverse_failed_payout_v6 should be called if reversing funds.
             await supabase.rpc('reverse_failed_payout_v6', { p_payout_id: payout.id });
        }
      } catch (err) {
        logger.warn(`[NowPaymentsPollingWorker] Failed to check payout ${payout.id}: ${err.message}`);
      }
    }
  }

  async executeRecovery(txId, payoutId, providerData, type) {
     logger.info(`[NowPaymentsPollingWorker] Recovering missed ${type} webhook for ${providerData.payment_id}`);
     
     const provider = PaymentFactory.getProviderByName("nowpayments");
     const event = provider.parseWebhookEvent(providerData);

     if (type === "deposit") {
         const { data: tx } = await supabase.from("transactions").select("wallet_id, user_id").eq("id", txId).single();
         if (tx) {
             event.transactionId = txId;
             event.walletId = tx.wallet_id;
             event.userId = tx.user_id;
         }
     } else {
         const { data: payout } = await supabase.from("payout_requests").select("wallet_id, user_id").eq("id", payoutId).single();
         if (payout) {
             event.transactionId = payoutId;
             event.walletId = payout.wallet_id;
             event.userId = payout.user_id;
             event.type = "payout";
         }
     }

     const result = await paymentService.executeWebhookAction(event, providerData, "nowpayments");

     if (result && result.status === "success") {
         await AuditLogService.log({
            user_id: event.userId,
            action: type === "payout" ? "crypto_withdrawal_recovered" : "crypto_deposit_recovered",
            ip: "127.0.0.1",
            device: "NowPaymentsPollingWorker",
            provider: "nowpayments",
            reference: event.reference,
            amount: event.amount,
            currency: event.currency,
            status: "success",
            webhook_id: providerData.payment_id
          });
          logger.info(`[NowPaymentsPollingWorker] Recovery successful for ${event.reference}`);
     }
  }
}

module.exports = new NowPaymentsPollingWorker();
