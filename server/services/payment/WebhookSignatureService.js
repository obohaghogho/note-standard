const crypto = require("crypto");
const logger = require("../../utils/logger");

/**
 * Webhook Signature Verification Service
 * Provides unified signature verification for all webhook providers.
 *
 * Security features:
 * - HMAC-based signature verification
 * - Timestamp validation to prevent replay attacks
 * - IP allowlist support for Brevo
 */
class WebhookSignatureService {
  /**
   * Maximum age (in seconds) of an acceptable webhook event.
   * Events older than this are considered replay attacks.
   */
  static MAX_EVENT_AGE_SECONDS = 300; // 5 minutes

  // ─── Brevo Inbound Parse ───────────────────────────────────────

  /**
   * Verify Brevo Inbound Parse webhook authenticity.
   *
   * Brevo inbound parse can be verified via:
   * 1. A shared secret token passed as a query parameter or custom header
   * 2. IP allowlisting (Brevo's IP ranges)
   *
   * @param {Object} headers - Request headers
   * @param {Object} body - Request body
   * @param {Object} query - Request query parameters
   * @returns {boolean}
   */
  static verifyBrevo(headers, body, query = {}) {
    const secret = process.env.BREVO_INBOUND_SECRET;

    if (!secret) {
      logger.warn(
        "[SignatureService] BREVO_INBOUND_SECRET missing. Skipping verification."
      );
      // In production, fail closed. In dev, allow through.
      return process.env.NODE_ENV !== "production";
    }

    // Method 1: Check custom header
    const headerToken =
      headers["x-brevo-inbound-secret"] ||
      headers["x-webhook-secret"] ||
      headers["authorization"]?.replace("Bearer ", "");

    if (headerToken === secret) return true;

    // Method 2: Check query parameter (Brevo allows appending ?secret=XXX to webhook URL)
    if (query.secret === secret) return true;

    // Method 3: Check body-embedded token (for some Brevo configurations)
    if (body?.secret === secret) return true;

    logger.warn("[SignatureService] Brevo verification failed: no matching secret found.");
    return false;
  }

  /**
   * Verify Brevo IP is from an expected range.
   * Brevo sends inbound parse from known IP ranges.
   * This is a secondary check, not a replacement for token verification.
   *
   * @param {string} ip - The request IP address
   * @returns {boolean}
   */
  static isBrevoIP(ip) {
    // Brevo known IP ranges (as of 2025/2026)
    // Updated periodically from https://developers.brevo.com/docs/ip-allowlisting
    const BREVO_IP_RANGES = [
      "1.179.112.",
      "185.107.232.",
      "176.119.200.",
      "149.202.",
      "51.38.",
      "51.68.",
      "51.75.",
      "51.77.",
      "51.83.",
      "54.36.",
      "137.74.",
      "164.132.",
      "178.32.",
      "213.32.",
    ];

    if (!ip) return false;

    // Support x-forwarded-for containing multiple IPs
    const cleanIp = ip.split(",")[0].trim();

    return BREVO_IP_RANGES.some((range) => cleanIp.startsWith(range));
  }

  // ─── SendGrid (Legacy) ────────────────────────────────────────

  /**
   * Verify SendGrid Inbound Parse Signature (Legacy, kept for backward compatibility)
   */
  static verifySendGrid(headers, body) {
    const secret = process.env.SENDGRID_INBOUND_PARSE_SECRET;
    if (!secret) {
      logger.warn(
        "[SignatureService] SENDGRID_INBOUND_PARSE_SECRET missing. Skipping verification."
      );
      return process.env.NODE_ENV !== "production";
    }

    const incomingSecret =
      headers["x-twilio-email-event-webhook-signature"] ||
      headers["x-sendgrid-secret"];
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
