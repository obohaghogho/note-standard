const axios = require("axios");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * requireRecaptcha
 * Verifies Google reCAPTCHA v2/v3 tokens.
 * Only enforces in production or if RECAPTCHA_SECRET_KEY is present.
 */
const requireRecaptcha = async (req, res, next) => {
  // Skip if not production
  if (env.NODE_ENV !== "production") {
    return next();
  }

  const token = req.body.captchaToken || req.headers["x-captcha-token"];

  if (!token) {
    return res.status(400).json({
      error: "Bot protection: reCAPTCHA token is missing.",
      code: "RECAPTCHA_REQUIRED",
    });
  }

  try {
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    );

    if (!response.data.success) {
      logger.warn(`[Security] reCAPTCHA verification failed`, {
        ip: req.ip,
        errors: response.data["error-codes"],
        origin: req.headers.origin,
      });
      return res.status(400).json({
        error: "Bot protection: reCAPTCHA verification failed.",
        code: "RECAPTCHA_FAILED",
        details: response.data["error-codes"],
      });
    }

    logger.info(`[Security] reCAPTCHA verified successfully for ${req.ip}`);
    next();
  } catch (error) {
    logger.error(`[Security] reCAPTCHA service error: ${error.message}`, {
      stack: error.stack,
      requestOrigin: req.headers.origin,
    });
    // If service is down, allowed but logged in production?
    // Usually safer to fail closed for financial apps.
    res.status(503).json({
      error: "Security service temporarily unavailable.",
    });
  }
};

const crypto = require("crypto");

/**
 * verifyTransactionSignature
 * Verifies HMAC-SHA256 signature of payload for sensitive financial operations.
 * This prevents tampering with transaction amounts or metadata.
 */
const verifyTransactionSignature = (req, res, next) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error("[Security] JWT_SECRET missing for transaction signing");
    return res.status(500).json({ error: "Security configuration error" });
  }

  const signature = req.headers["x-transaction-signature"];
  
  // In development, we can allow skipping if not provided, 
  // but in production it's mandatory for protected routes.
  if (!signature) {
    if (env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Missing transaction signature" });
    }
    return next();
  }

  try {
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (signature !== expectedSignature) {
      logger.warn(`[Security] Invalid transaction signature for ${req.ip}`);
      return res.status(403).json({ error: "Invalid transaction signature" });
    }

    next();
  } catch (err) {
    logger.error("[Security] Signature verification failed:", err.message);
    res.status(500).json({ error: "Security check failed" });
  }
};

module.exports = {
  requireRecaptcha,
  verifyTransactionSignature,
};
