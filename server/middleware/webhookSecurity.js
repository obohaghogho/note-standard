const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");
const WebhookSignatureService = require("../services/payment/WebhookSignatureService");

/**
 * Webhook Security Middleware
 *
 * Provides layered security for all webhook endpoints:
 * 1. Rate limiting per IP
 * 2. Payload size validation
 * 3. Brevo IP allowlisting (optional, secondary check)
 * 4. Replay attack prevention via timestamp validation
 * 5. Content-type enforcement
 */

/**
 * Rate limiter for webhook endpoints.
 * More generous than user-facing endpoints (webhooks can be bursty).
 */
const webhookRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("[WebhookSecurity] Rate limit exceeded", {
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      path: req.path,
    });
    // Still return 200 to prevent provider from marking endpoint as down
    res.status(200).json({
      received: true,
      error: "Rate limit exceeded",
    });
  },
});

/**
 * Validate webhook payload size.
 * Prevents oversized payloads from consuming resources.
 * Max: 1MB (Brevo inbound parse emails can be large with HTML)
 */
const validatePayloadSize = (req, res, next) => {
  const maxSize = 1024 * 1024; // 1MB

  if (req.headers["content-length"] && parseInt(req.headers["content-length"]) > maxSize) {
    logger.warn("[WebhookSecurity] Oversized payload rejected", {
      size: req.headers["content-length"],
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    });
    return res.status(200).json({ received: true, error: "Payload too large" });
  }

  next();
};

/**
 * Brevo IP check middleware (secondary security layer).
 * Logs a warning if the request comes from an unexpected IP.
 * Does NOT reject — this is informational only for monitoring.
 */
const checkBrevoIP = (req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const isKnownIP = WebhookSignatureService.isBrevoIP(ip);

  if (!isKnownIP) {
    logger.info("[WebhookSecurity] Brevo webhook from non-standard IP:", ip);
    // Don't reject — IP ranges can change. The secret token is the real check.
  }

  next();
};

/**
 * Replay attack prevention middleware.
 * Checks if the webhook event includes a timestamp and rejects stale events.
 *
 * Providers that include timestamps:
 * - Paystack: in event.data.paid_at or event.data.created_at
 * - Brevo: in Items[0].SentAtDate
 *
 * For providers without timestamps, this middleware passes through.
 */
const preventReplay = (maxAgeSeconds = 600) => {
  return (req, res, next) => {
    let timestamp = null;

    // Try to extract timestamp from known provider formats
    if (req.body?.data?.paid_at) {
      timestamp = req.body.data.paid_at;
    } else if (req.body?.data?.created_at) {
      timestamp = req.body.data.created_at;
    } else if (req.body?.Items?.[0]?.SentAtDate) {
      timestamp = req.body.Items[0].SentAtDate;
    } else if (req.body?.timestamp) {
      timestamp = req.body.timestamp;
    }

    if (timestamp) {
      const check = WebhookSignatureService.verifyTimestamp(
        timestamp,
        maxAgeSeconds
      );

      if (!check.valid) {
        logger.warn("[WebhookSecurity] Stale webhook event rejected", {
          ageSeconds: check.ageSeconds,
          maxAge: maxAgeSeconds,
          path: req.path,
        });

        // Return 200 so the provider doesn't retry
        return res.status(200).json({
          received: true,
          error: "Event too old",
        });
      }
    }

    next();
  };
};

/**
 * Ensure raw body is available for signature verification.
 * Express's json() parser with verify option captures this,
 * but this middleware ensures it's set.
 */
const ensureRawBody = (req, res, next) => {
  if (!req.rawBody && req.body) {
    // If rawBody wasn't captured by express.json verify option,
    // create it from the parsed body (less ideal but functional)
    req.rawBody = Buffer.from(JSON.stringify(req.body));
  }
  next();
};

/**
 * Combined webhook security stack.
 * Use this as middleware on webhook routes:
 *
 *   router.post("/paystack", ...webhookSecurity.stack, handler);
 *
 * Or apply to all webhook routes:
 *
 *   router.use(webhookSecurity.common);
 */
module.exports = {
  // Individual middleware
  rateLimiter: webhookRateLimiter,
  validatePayloadSize,
  checkBrevoIP,
  preventReplay,
  ensureRawBody,

  // Common stack for all webhooks
  common: [webhookRateLimiter, validatePayloadSize, ensureRawBody],

  // Brevo-specific stack
  brevoStack: [
    webhookRateLimiter,
    validatePayloadSize,
    checkBrevoIP,
    ensureRawBody,
  ],

  // Full stack with replay prevention (10-minute window)
  strict: [
    webhookRateLimiter,
    validatePayloadSize,
    ensureRawBody,
    preventReplay(600),
  ],
};
