const supabase = require("../../../config/supabase");
const logger = require("../../../utils/logger");

/**
 * Base Payment Provider Class
 * Defines the interface for all payment gateway implementations
 */
class BaseProvider {
  constructor() {
    if (this.constructor === BaseProvider) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  /**
   * Initialize a transaction
   * @param {Object} data - Transaction data
   * @param {string} data.email - Customer email
   * @param {number} data.amount - Amount in currency unit (not smallest unit)
   * @param {string} data.currency - Currency code (NGN, USD, etc.)
   * @param {string} data.reference - Unique transaction reference
   * @param {string} data.callbackUrl - URL to redirect to after payment
   * @param {Object} data.metadata - Additional metadata
   * @returns {Promise<Object>} - Payment initialization response { checkoutUrl, providerReference }
   */
  async initialize(data) {
    throw new Error("Method 'initialize()' must be implemented.");
  }

  /**
   * Verify a transaction
   * @param {string} reference - Provider reference or our reference
   * @returns {Promise<Object>} - Verification response { success, status, amount, currency }
   */
  async verify(reference) {
    throw new Error("Method 'verify()' must be implemented.");
  }

  /**
   * Verify webhook signature
   * @param {Object} headers - Request headers
   * @param {Object|string} body - Request body
   * @returns {boolean} - Whether the signature is valid
   */
  verifyWebhookSignature(headers, body) {
    throw new Error("Method 'verifyWebhookSignature()' must be implemented.");
  }

  /**
   * Map webhook event to unified status
   * @param {Object} payload - Webhook payload
   * @returns {Object} - Unified event { type, reference, status, raw }
   */
  parseWebhookEvent(payload) {
    throw new Error("Method 'parseWebhookEvent()' must be implemented.");
  }

  /**
   * Unified Webhook Processor (Enforces Stability Rules)
   * 1. Verifies Signature
   * 2. Checks Idempotency
   * 3. Wraps in Try/Catch
   * 4. Always returns HTTP 200 OK (unless signature fails)
   */
  async processWebhook(req, res) {
    try {
      const providerName = this.constructor.name.replace("Provider", "")
        .toLowerCase();
      logger.info(`[${providerName}] Webhook Received`);

      // 1. Verify Signature
      if (!this.verifyWebhookSignature(req.headers, req.body, req.rawBody)) {
        logger.warn(
          `[${providerName}] Suspicious Webhook Attempt (Unauthorized signature)`,
        );
        return res.status(401).json({ error: "Invalid signature" });
      }

      // 2. Parse Event & Get Reference
      const event = this.parseWebhookEvent(req.body);
      const reference = event.reference ||
        req.body.order_id ||
        req.body.payment_id ||
        req.body.data?.reference ||
        req.body.tx_ref;

      // 3. Log Webhook for Audit Trail
      let logId;
      try {
        const { data: logEntry } = await supabase
          .from("webhook_logs")
          .insert({
            provider: providerName,
            payload: req.body,
            headers: req.headers,
            reference: reference,
            ip_address: req.headers["x-forwarded-for"] || "unknown",
          })
          .select("id")
          .single();
        logId = logEntry?.id;
      } catch (err) {
        logger.error(`[${providerName}] Failed to log webhook`, {
          error: err.message,
        });
      }

      // 4. Idempotency Check (status !== COMPLETED)
      if (reference) {
        const { data: tx } = await supabase
          .from("transactions")
          .select("status")
          .eq("reference_id", reference)
          .single();

        if (
          tx &&
          ["COMPLETED", "SUCCESS", "FAILED"].includes(tx.status?.toUpperCase())
        ) {
          logger.info(
            `[${providerName}] Idempotency Check: Transaction ${reference} already ${tx.status}. Skipping.`,
          );
          if (logId) {
            await supabase
              .from("webhook_logs")
              .update({
                processed: true,
                processing_error: "Already completed",
              })
              .eq("id", logId);
          }
          return res.status(200).json({
            received: true,
            message: "Already Processed",
          });
        }
      }

      // 5. Hand Over to PaymentService Main Execution
      const paymentService = require("../paymentService");
      const result = await paymentService.executeWebhookAction(
        event,
        req.body,
        providerName,
      );

      if (logId) {
        await supabase
          .from("webhook_logs")
          .update({ processed: true, processing_error: result?.error || null })
          .eq("id", logId);
      }

      // 6. Return 200 HTTP Always
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error(
        `[BaseProvider] Critical Webhook Crash Caught: ${error.message}`,
      );
      // GMAIL BOUNCE FIX: Output 200 to prevent provider loop spam
      return res.status(200).json({
        received: true,
        error: "Internal processing error logged",
      });
    }
  }
}

module.exports = BaseProvider;
