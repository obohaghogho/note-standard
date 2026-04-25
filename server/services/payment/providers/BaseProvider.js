const supabase = require("../../../config/database");
const logger = require("../../../utils/logger");
const SystemState = require("../../../config/SystemState");
const redis = require("../../../config/redis");
const { paymentQueue } = require("../paymentQueue");
const LockService = require("../LockService");

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
    const providerName = this.constructor.name.replace("Provider", "").toLowerCase();
    
    try {
      logger.info(`[${providerName}] Webhook Ingestion Start`);

      // 1. STAGE: VERIFY (Cryptographic Gatekeeper)
      // We do this BEFORE acknowledging 200 OK. If the signature is wrong, 
      // we WANT the provider to know via a 401 status.
      if (!this.verifyWebhookSignature(req.headers, req.body, req.rawBody)) {
        logger.warn(`[${providerName}] REJECTED: Invalid Cryptographic Signature.`);
        return res.status(401).json({ 
          success: false, 
          error: "Invalid signature",
          timestamp: new Date().toISOString()
        });
      }

      // 2. STAGE: NORMALIZE (Logic Bridge)
      let event;
      try {
        event = this.parseWebhookEvent(req.body);
      } catch (err) {
        logger.error(`[${providerName}] REJECTED: Payload Normalization Failed: ${err.message}`);
        return res.status(400).json({ 
          success: false, 
          error: "Malformed payload for provider contract",
          details: err.message
        });
      }

      const reference = event.reference || "unknown";
      const eventId = event.transactionId || reference;

      // 3. STAGE: AUDIT LOG (First Persistence)
      let logId;
      try {
        const { data: logEntry } = await supabase
          .from("webhook_logs")
          .insert({
            provider: providerName,
            payload: req.body,
            headers: req.headers,
            reference: reference,
            ip_address: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local",
          })
          .select("id")
          .single();
        logId = logEntry?.id;
      } catch (err) {
        // Non-blocking but logged
        logger.error(`[${providerName}] Failed to log hit to webhook_logs: ${err.message}`);
      }

      // 4. STAGE: ACKNOWLEDGMENT (The 200 OK Handshake)
      // At this point, we have verified the sender and parsed the intent.
      // We are "legitimately" holding the ball.
      res.status(200).json({ status: "received", eventId });

      // 5. STAGE: BACKGROUND SETTLEMENT (Mutex-Locked)
      // We move to a background execution to prevent provider timeouts during DB/Service contention.
      setImmediate(async () => {
        try {
          // ── Task 4.a: Redis-Backed Idempotency Guard ───
          if (eventId && redis) {
            const idempotencyKey = `webhook_proof:${eventId}`;
            const exists = await redis.get(idempotencyKey);
            if (exists) {
              logger.info(`[${providerName}] Idempotency Deduplicated (Redis): ${eventId}`);
              return;
            }
            await redis.set(idempotencyKey, "1", "EX", 3600);
          }

          // ── Task 4.b: Safe Mode Deflection ───
          const isCoreLane = ["DEPOSIT", "FUNDING", "DIGITAL ASSETS PURCHASE"].includes(event.type?.toUpperCase());
          if (SystemState.isSafe() && !isCoreLane) {
            logger.warn(`[${providerName}] System in SAFE_MODE. Deflecting to reconciliation queue.`);
            if (paymentQueue) {
              await paymentQueue.add("pending_webhook_safe_mode", {
                provider: providerName,
                event,
                payload: req.body,
                deferred_at: new Date().toISOString()
              }, { jobId: eventId });
            }
            return;
          }

          const paymentService = require("../paymentService");
          
          await LockService.withLock(eventId, async () => {
              // ── Final DB Idempotency Check inside Lock ───
              const { data: alreadyProcessed } = await supabase
                .from("webhook_events")
                .select("id")
                .eq("external_id", eventId)
                .maybeSingle();

              if (alreadyProcessed) {
                logger.info(`[${providerName}] Mutex Win: Event ${eventId} already in webhook_events.`);
                return { status: "already_completed" };
              }

              return await paymentService.executeWebhookAction(
                event,
                req.body,
                providerName,
              );
          }, { ttl: 30000, retryWindow: 10000 });

          // Mark log as successful
          if (logId) {
            await supabase.from("webhook_logs").update({ processed: true }).eq("id", logId);
          }

        } catch (bgError) {
          logger.error(`[${providerName}] Post-Ack Processing Failure: ${bgError.message}`, { eventId });
          
          // ── Task 5: Dead Letter Queue (DLQ) Fallback ───
          try {
            await supabase.from("dead_letter_webhooks").insert({
              job_id: eventId,
              event_id: eventId,
              raw_payload: req.body,
              reason: bgError.message,
              failure_class: 'INFRA_TEMPORARY'
            });
          } catch (dlqErr) {
            logger.error(`[CRITICAL] Failed to move failed webhook to DLQ: ${dlqErr.message}`);
          }
        }
      });

    } catch (criticalError) {
      logger.error(`[${providerName}] Ingestion Pipeline Crash: ${criticalError.message}`);
      if (!res.headersSent) {
        return res.status(500).json({ error: "System-level ingestion rejection. Please retry." });
      }
    }
  }
}

module.exports = BaseProvider;
