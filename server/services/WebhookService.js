const crypto = require("crypto");
const supabase = require("../config/database");
const logger = require("../utils/logger");
const FiatWalletService = require("./FiatWalletService");
const { createNotification } = require("./notificationService");
const realtime = require("./realtimeService");
const AuditLogService = require("./AuditLogService");
const HealthMonitorService = require("./HealthMonitorService");
const WebhookSignatureService = require("./payment/WebhookSignatureService");
const PaymentFactory = require("./payment/PaymentFactory");
const paymentService = require("./payment/paymentService");

/**
 * WebhookService
 * Handles Paystack (Fiat) Webhooks with strict atomic verification and processing.
 */
class WebhookService {
  /**
   * Verify signature of Paystack webhook
   */
  verifySignature(req) {
    return WebhookSignatureService.verifyPaystack(req.headers, req.rawBody);
  }

  /**
   * Process incoming Paystack webhook completely atomically
   */
  async processPaystackWebhook(req, res) {
    const event = req.body;
    const reference = event?.data?.reference || "unknown";
    let txRecord = null;

    try {
      logger.info(`[WebhookService] Webhook received for Paystack. Reference: ${reference}`);

      // 1. Verify signature
      if (!this.verifySignature(req)) {
        logger.warn(`[WebhookService] Invalid Paystack signature for reference: ${reference}`);
        return res.status(401).send("Unauthorized");
      }
      logger.info(`[WebhookService] Signature verified successfully. Reference: ${reference}`);

      // 2. Verify event type is charge.success
      if (event.event !== "charge.success") {
        logger.info(`[WebhookService] Ignored event type: ${event.event} for reference: ${reference}`);
        return res.status(200).send("Ignored event");
      }

      const { amount, currency, status } = event.data;

      // 3. Find transaction by reference
      const { data: dbTx, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("reference_id", reference)
        .single();

      if (txError || !dbTx) {
        logger.warn(`[WebhookService] Transaction not found for reference: ${reference}. Error: ${txError?.message}`);
        return res.status(200).send("Transaction not found");
      }
      txRecord = dbTx;
      logger.info(`[WebhookService] Transaction found. User ID: ${txRecord.user_id}, Transaction ID: ${txRecord.id}, Status: ${txRecord.status}`);

      // 4. Check idempotency: If already COMPLETED, return success instantly
      if (txRecord.status === "COMPLETED") {
        logger.info(`[WebhookService] Duplicate webhook ignored (Already COMPLETED). Reference: ${reference}`);
        return res.status(200).send("Duplicate webhook ignored");
      }

      // 5. Verify amount/currency
      const expectedKobo = Math.round(txRecord.amount * 100);
      const difference = amount - expectedKobo;
      // Allow actual amount to be equal to expected, or slightly higher (up to 10% + 200 units for gateway fees)
      const maxAllowedFees = Math.round(expectedKobo * 0.10) + 20000;

      if (
        status !== "success" ||
        txRecord.currency.toUpperCase() !== currency.toUpperCase() ||
        amount < expectedKobo ||
        difference > maxAllowedFees
      ) {
        logger.error(`[WebhookService] Verification mismatch for reference: ${reference}. Expected min: ${expectedKobo} kobo, Got: ${amount} kobo. Expected Currency: ${txRecord.currency}, Got: ${currency}`);
        return res.status(200).send("Verification mismatch");
      }
      logger.info(`[WebhookService] Amount verified. Reference: ${reference}`);

      // 6. Credit wallet via the SINGLE authoritative DepositCreditEngine
      const DepositCreditEngine = require("./payment/DepositCreditEngine");
      const creditResult = await DepositCreditEngine.credit({
        transactionId: txRecord.id,
        reference,
        amount: txRecord.amount,
        currency: txRecord.currency,
        userId: txRecord.user_id,
        providerTxId: event.data.id ? String(event.data.id) : null,
        source: 'PAYSTACK_WEBHOOK',
        auditMeta: {
          ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || 'unknown',
          device: req.headers["user-agent"],
          webhook_id: event.data.id,
        },
      });

      if (creditResult.error) {
        logger.error(`[WebhookService] DepositCreditEngine returned error for ${reference}: ${creditResult.error}`);
      } else if (creditResult.credited) {
        logger.info(`[WebhookService] ✅ Wallet credited via DepositCreditEngine. Reference: ${reference}`);
      } else if (creditResult.alreadyCredited) {
        logger.info(`[WebhookService] Idempotency hit via DepositCreditEngine (already credited). Reference: ${reference}`);
      }

      logger.info(`[WebhookService] Finished processing successfully. Reference: ${reference}`);
      return res.status(200).send("OK");
    } catch (error) {
      logger.error(`[WebhookService] Critical webhook processing failure! Reference: ${reference}, User ID: ${txRecord?.user_id || "unknown"}, Transaction ID: ${txRecord?.id || "unknown"}, Error: ${error.message}, Stack: ${error.stack}`);
      
      // Update transaction status to NEEDS_REVIEW
      if (txRecord && txRecord.id) {
        try {
          await supabase
            .from("transactions")
            .update({ status: "NEEDS_REVIEW", updated_at: new Date().toISOString() })
            .eq("id", txRecord.id);
          logger.warn(`[WebhookService] Transaction ${txRecord.id} marked as NEEDS_REVIEW.`);
        } catch (dbErr) {
          logger.error(`[WebhookService] Failed to set status to NEEDS_REVIEW: ${dbErr.message}`);
        }
      }

      // Return 200 to prevent Paystack from retrying and causing duplicate load
      return res.status(200).send("OK");
    }
  }

  /**
   * Process incoming NOWPayments webhook completely atomically
   */
  async processNowPaymentsWebhook(req, res) {
    try {
      // 1. Verify signature
      if (!WebhookSignatureService.verifyNowPayments(req.headers, req.body)) {
        logger.warn("[WebhookService] Invalid NOWPayments signature");
        return res.status(401).send("Unauthorized");
      }

      const payload = req.body;
      const provider = PaymentFactory.getProviderByName("nowpayments");
      const event = provider.parseWebhookEvent(payload);

      // Enhance event with DB context
      const { data: tx } = await supabase
        .from("transactions")
        .select("id, wallet_id")
        .eq("reference_id", event.reference)
        .maybeSingle();

      if (tx) {
        event.transactionId = tx.id;
        event.walletId = tx.wallet_id;
      } else {
        // Check if it's a payout
        const { data: payout } = await supabase
          .from("payout_requests")
          .select("id, wallet_id")
          .eq("id", event.reference)
          .maybeSingle();
          
        if (payout) {
          event.transactionId = payout.id;
          event.walletId = payout.wallet_id;
          event.type = "payout"; // Force payout type
        }
      }

      const result = await paymentService.executeWebhookAction(event, payload, "nowpayments");

      if (result && result.status === "success") {
        const userId = event.userId;
        if (userId) {
          // Audit Log
          await AuditLogService.log({
            user_id: userId,
            action: event.type === "payout" ? "crypto_withdrawal_webhook" : "crypto_deposit_webhook",
            ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || 'unknown',
            device: req.headers["user-agent"],
            provider: "nowpayments",
            reference: event.reference,
            amount: event.amount,
            currency: event.currency,
            status: "success",
            webhook_id: payload.payment_id
          });

          // Notification
          await createNotification({
            receiverId: userId,
            type: event.type === "payout" ? "wallet_withdrawal" : "wallet_deposit",
            title: event.type === "payout" ? "Withdrawal Successful" : "Deposit Successful",
            message: `Your ${event.type === "payout" ? "withdrawal" : "deposit"} of ${event.amount} ${event.currency} was successful.`,
            link: "/dashboard/wallet",
          });

          // Realtime Emit
          await realtime.emitToUser(userId, "wallet_update", {
            currency: event.currency,
            amount: event.amount,
            type: event.type === "payout" ? "withdrawal" : "deposit",
            status: "COMPLETED"
          });
        }
      }

      return res.status(200).send("OK");
    } catch (error) {
      logger.error("[WebhookService] Error processing NOWPayments webhook:", error);
      return res.status(200).send("Internal processing error");
    }
  }

  async handleSendGridInbound(req, res) {
    // SendGrid inbound parsing for Grey/Other emails is currently legacy/disabled
    // Respond 200 to prevent SendGrid from retrying
    logger.info("[WebhookService] SendGrid Inbound Parse received (Legacy/Disabled). Ignoring.");
    return res.status(200).json({ received: true, status: "disabled" });
  }

}

module.exports = new WebhookService();
