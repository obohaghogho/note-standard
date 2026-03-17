const supabase = require("../../../config/database");
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
    // 1. ABSOLUTE EARLY RETURN: Guaranteed 200 OK to stop retries/timeouts
    // Send this immediately before ANY database or logging logic.
    if (!res.headersSent) {
      res.status(200).json({ received: true });
    }

    try {
      const providerName = this.constructor.name.replace("Provider", "")
        .toLowerCase();
      logger.info(`[${providerName}] Webhook Received`);

      // 3. Process the webhook asynchronously in the background
      (async () => {
        try {
          // Parse Event & Get Reference
          let event = {};
          let reference = null;
          try {
            event = this.parseWebhookEvent(req.body);
            reference = event.reference || req.body.order_id ||
              req.body.payment_id || req.body.data?.merchantReference ||
              req.body.data?.reference || req.body.tx_ref;
          } catch (err) {
            logger.warn(
              `[${providerName}] Could not parse webhook event cleanly.`,
            );
          }

          // Log Webhook for Audit Trail FIRST (so we can debug signature mismatches exactly)
          let logId;
          try {
            const { data: logEntry } = await supabase
              .from("webhook_logs")
              .insert({
                provider: providerName,
                payload: req.body,
                headers: req.headers,
                reference: reference || "unknown",
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

          // 1. Verify Signature AFTER logging!
          if (
            !this.verifyWebhookSignature(req.headers, req.body, req.rawBody)
          ) {
            logger.warn(
              `[${providerName}] Suspicious Webhook Attempt (Unauthorized signature) logged and dropped.`,
            );
            if (logId) {
              await supabase.from("webhook_logs").update({
                processed: false,
                processing_error: "Invalid signature hook dropped anonymously",
              }).eq("id", logId);
            }
            return; // Secretly drop bad payloads
          }

          // Idempotency Check (status !== COMPLETED or payments.credited)
          if (reference) {
            const { data: tx } = await supabase
              .from("transactions")
              .select("status")
              .eq("reference_id", reference)
              .single();

            const { data: payRecord } = await supabase
              .from("payments")
              .select("credited")
              .eq("reference", reference)
              .single();

            if (
              (tx &&
                ["COMPLETED", "SUCCESS", "FAILED"].includes(
                  tx.status?.toUpperCase(),
                )) ||
              payRecord?.credited
            ) {
              logger.info(
                `[${providerName}] Idempotency Check: Transaction ${reference} already processed. Skipping.`,
              );
              if (logId) {
                await supabase
                  .from("webhook_logs")
                  .update({
                    processed: true,
                    processing_error: "Already processed",
                  })
                  .eq("id", logId);
              }
              return; // Already sent 200 OK
            }
          }

          // Hand Over to PaymentService Main Execution
          const paymentService = require("../paymentService");
          const result = await paymentService.executeWebhookAction(
            event,
            req.body,
            providerName,
          );

          if (logId) {
            await supabase
              .from("webhook_logs")
              .update({
                processed: true,
                processing_error: result?.error || null,
              })
              .eq("id", logId);
          }
        } catch (backgroundError) {
          logger.error(
            `[BaseProvider] Background Webhook Processing Error: ${backgroundError.message}`,
          );
        }
      })();
    } catch (error) {
      logger.error(
        `[BaseProvider] Critical Webhook Crash Caught: ${error.message}`,
      );
      if (!res.headersSent) {
        return res.status(200).json({
          received: true,
          error: "Internal processing error logged",
        });
      }
    }
  }
}

module.exports = BaseProvider;
