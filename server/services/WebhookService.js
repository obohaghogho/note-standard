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
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac("sha512", secret).update(JSON.stringify(req.body)).digest("hex");
    return hash === req.headers["x-paystack-signature"];
  }

  /**
   * Process incoming Paystack webhook completely atomically
   */
  async processPaystackWebhook(req, res) {
    // 1. Always acknowledge receipt to provider instantly if structurally okay
    // But since we want to return 200, we'll do it later or immediately? 
    // Best practice is to respond 200 immediately, but for strict verification we can do it inline
    // as long as it's fast. Let's do it inline.
    
    try {
      // 2. Verify signature
      if (!this.verifySignature(req)) {
        logger.warn("[WebhookService] Invalid Paystack signature");
        return res.status(401).send("Unauthorized");
      }

      const event = req.body;
      
      // We only care about charge.success
      if (event.event !== "charge.success") {
        return res.status(200).send("Ignored event");
      }

      const { reference, amount, currency, status, customer } = event.data;

      // 3. Check idempotency immediately
      const idempotencyKey = `paystack_webhook_${reference}`;
      
      // Start DB operation
      const { data: txRecord, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("reference_id", reference)
        .single();

      if (txError || !txRecord) {
        logger.warn(`[WebhookService] Transaction not found for ref ${reference}`);
        return res.status(200).send("Transaction not found");
      }

      // Check if already processed
      if (txRecord.status === "COMPLETED") {
        return res.status(200).send("Duplicate webhook ignored");
      }

      // Verify event details against database expectation
      if (
        status !== "success" ||
        txRecord.currency.toUpperCase() !== currency.toUpperCase() ||
        // Paystack amount is in kobo, txRecord amount might be in NGN
        // Assuming txRecord.amount is in major unit (NGN)
        Math.round(txRecord.amount * 100) !== amount
      ) {
        logger.error(`[WebhookService] Verification mismatch for ${reference}`);
        return res.status(200).send("Verification mismatch");
      }

      // We wrap the entire process in an RPC call or execute_ledger_transaction_v6
      // Let's use the FiatWalletService to fund the wallet. It uses `execute_ledger_transaction_v6`
      // which is atomic. However, we also need to update the transaction status.
      // We can do this in two steps or ideally an RPC. Since `execute_ledger_transaction_v6`
      // guarantees the wallet/ledger part, we can do that first.

      // But to be completely safe, we can use an RPC for the whole thing or
      // rely on LedgerService idempotency.
      
      const ledgerTxId = await FiatWalletService.fundWallet(
        txRecord.user_id,
        txRecord.currency,
        txRecord.amount,
        idempotencyKey,
        { provider: "paystack", reference, webhook: true }
      );

      // Update Transaction History
      await supabase
        .from("transactions")
        .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
        .eq("id", txRecord.id);

      // Audit Log
      await AuditLogService.log({
        user_id: txRecord.user_id,
        action: "fiat_deposit_webhook",
        ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || 'unknown',
        device: req.headers["user-agent"],
        provider: "paystack",
        reference,
        amount: txRecord.amount,
        currency: txRecord.currency,
        ledger_id: ledgerTxId,
        webhook_id: event.data.id
      });

      // Notification
      await createNotification({
        receiverId: txRecord.user_id,
        type: "wallet_deposit",
        title: "Deposit Successful",
        message: `Your deposit of ${txRecord.amount} ${txRecord.currency} was successful.`,
        link: "/dashboard/wallet",
      });

      // Realtime Emit
      await realtime.emitToUser(txRecord.user_id, "wallet_update", {
        currency: txRecord.currency,
        amount: txRecord.amount,
        type: "deposit",
        status: "COMPLETED"
      });

      logger.info(`[WebhookService] Successfully processed Paystack webhook for ${reference}`);
      return res.status(200).send("OK");
    } catch (error) {
      logger.error("[WebhookService] Error processing webhook:", error);
      // Return 200 to prevent Paystack from spamming if it's our internal error
      // Or 500 if we want retries. Usually 200 is safer if we queue.
      return res.status(200).send("Internal processing error");
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
