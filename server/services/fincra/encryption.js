/**
 * Fincra Integration — SHA-512 HMAC Encryption & Signature Validation
 * ─────────────────────────────────────────────────────────────────────
 * Implements cryptographic webhook signature verification using SHA-512 HMAC.
 * Uses timing-safe comparison to prevent timing side-channel attacks.
 *
 * Fincra webhook security documentation:
 *   Fincra generates a SHA-512 HMAC of the raw request body using your
 *   FINCRA_WEBHOOK_SECRET. The resulting hex digest is sent in the
 *   `x-webhook-signature` or `signature` header.
 */

const crypto = require("crypto");
const logger = require("../../utils/logger");
const { FincraSignatureError } = require("./errors");

/**
 * Verify an incoming Fincra webhook signature.
 *
 * @param {object} headers   - Raw request headers object.
 * @param {string} rawBody   - Raw request body string (MUST be the raw buffer, not parsed JSON).
 * @returns {boolean}        - True if valid.
 * @throws {FincraSignatureError} if signature is missing or invalid.
 */
function verifyFincraWebhookSignature(headers, rawBody) {
  const secret = (process.env.FINCRA_WEBHOOK_SECRET || "").trim();

  if (!secret) {
    logger.error("[Fincra/encryption] FINCRA_WEBHOOK_SECRET is not configured.");
    throw new FincraSignatureError("FINCRA_WEBHOOK_SECRET is not set on this server.");
  }

  // Fincra sends the signature in multiple possible header names
  const incomingSignature =
    headers["x-webhook-signature"] ||
    headers["x-fincra-signature"]  ||
    headers["signature"]           ||
    "";

  if (!incomingSignature) {
    logger.warn("[Fincra/encryption] Webhook received without a signature header.");
    throw new FincraSignatureError("Missing Fincra webhook signature header.");
  }

  const payload = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);

  const computed = crypto
    .createHmac("sha512", secret)
    .update(payload)
    .digest("hex");

  // Timing-safe comparison to prevent timing side-channel attacks
  const incomingBuffer = Buffer.from(incomingSignature, "utf8");
  const computedBuffer = Buffer.from(computed, "utf8");

  if (incomingBuffer.length !== computedBuffer.length) {
    throw new FincraSignatureError("Fincra webhook signature length mismatch.");
  }

  const isValid = crypto.timingSafeEqual(incomingBuffer, computedBuffer);

  if (!isValid) {
    logger.warn("[Fincra/encryption] Webhook signature verification FAILED.");
    throw new FincraSignatureError("Fincra webhook signature verification failed.");
  }

  logger.info("[Fincra/encryption] Webhook signature verified successfully.");
  return true;
}

/**
 * Generate a SHA-256 hash of the raw webhook body for idempotency key.
 * This hash is stored in fincra_webhook_logs.event_hash (UNIQUE index)
 * to prevent duplicate processing of replayed webhooks.
 *
 * @param {string} rawBody
 * @returns {string} SHA-256 hex digest
 */
function generateEventHash(rawBody) {
  const payload = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

module.exports = {
  verifyFincraWebhookSignature,
  generateEventHash,
};
