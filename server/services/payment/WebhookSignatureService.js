const crypto = require("crypto");
const logger = require("../../utils/logger");

/**
 * Webhook Signature Verification Service
 * Provides unified signature verification for all webhook providers.
 *
 * Security features:
 * - HMAC-based signature verification
 * - Timestamp validation to prevent replay attacks
 */
class WebhookSignatureService {
  /**
   * Maximum age (in seconds) of an acceptable webhook event.
   * Events older than this are considered replay attacks.
   */
  static MAX_EVENT_AGE_SECONDS = 300; // 5 minutes

  static verifySendGrid(headers, body, query = {}) {
    const secret = process.env.SENDGRID_INBOUND_PARSE_SECRET;
    if (!secret) {
      logger.warn(
        "[SignatureService] SENDGRID_INBOUND_PARSE_SECRET missing. Skipping verification."
      );
      return process.env.NODE_ENV !== "production";
    }

    const incomingSecret =
      query.secret ||
      headers["x-twilio-email-event-webhook-signature"] ||
      headers["x-sendgrid-secret"] ||
      body?.secret;

    return incomingSecret === secret;
  }

  // ─── Paystack ─────────────────────────────────────────────────

  /**
   * Verify Paystack webhook signature (HMAC-SHA512)
   *
   * @param {Object} headers - Request headers
   * @param {Buffer|string} rawBody - Raw request body (Buffer preferred)
   * @returns {boolean}
   */
  static verifyPaystack(headers, rawBody) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      logger.error("[SignatureService] PAYSTACK_SECRET_KEY missing!");
      return false;
    }

    const signature = headers["x-paystack-signature"];
    if (!signature) return false;

    const data =
      rawBody instanceof Buffer ? rawBody : Buffer.from(String(rawBody));

    const hash = crypto
      .createHmac("sha512", secret)
      .update(data)
      .digest("hex");

    // Guard: timingSafeEqual requires same-length buffers
    if (hash.length !== signature.length) return false;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash, "utf8"),
        Buffer.from(signature, "utf8")
      );
    } catch {
      return false;
    }
  }

  // ─── Generic ──────────────────────────────────────────────────

  /**
   * Verify Generic Signature (HMAC-SHA256)
   */
  static verifyGeneric(
    headers,
    body,
    secret,
    headerName = "x-webhook-signature"
  ) {
    if (!secret) return true;

    const signature = headers[headerName];
    if (!signature) return false;

    const hash = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(body))
      .digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(signature, "hex")
      );
    } catch {
      return false;
    }
  }

  // ─── Replay Attack Prevention ─────────────────────────────────

  /**
   * Check if a webhook event timestamp is within the acceptable window.
   * Prevents replay attacks by rejecting old events.
   *
   * @param {string|number|Date} timestamp - The event timestamp
   * @param {number} maxAgeSeconds - Maximum acceptable age (default: 5 minutes)
   * @returns {{ valid: boolean, ageSeconds: number }}
   */
  static verifyTimestamp(timestamp, maxAgeSeconds = this.MAX_EVENT_AGE_SECONDS) {
    if (!timestamp) {
      return { valid: true, ageSeconds: 0 }; // If no timestamp provided, skip check
    }

    let eventTime;
    if (typeof timestamp === "number") {
      // Unix timestamp (seconds or milliseconds)
      eventTime = timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
    } else {
      eventTime = new Date(timestamp);
    }

    if (isNaN(eventTime.getTime())) {
      logger.warn("[SignatureService] Invalid timestamp format:", timestamp);
      return { valid: false, ageSeconds: Infinity };
    }

    const ageSeconds = Math.abs((Date.now() - eventTime.getTime()) / 1000);

    return {
      valid: ageSeconds <= maxAgeSeconds,
      ageSeconds: Math.round(ageSeconds),
    };
  }
}

module.exports = WebhookSignatureService;
