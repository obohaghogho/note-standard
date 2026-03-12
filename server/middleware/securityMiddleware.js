const axios = require("axios");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * requireRecaptcha
 * Verifies Google reCAPTCHA v2/v3 tokens.
 * Only enforces in production or if RECAPTCHA_SECRET_KEY is present.
 */
const requireRecaptcha = async (req, res, next) => {
  // Skip if not production and no key set
  if (env.NODE_ENV !== "production" && !env.RECAPTCHA_SECRET_KEY) {
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

/**
 * verifyTransactionSignature
 * (Placeholder) Verifies HMAC signature of payload for sensitive operations.
 */
const verifyTransactionSignature = (req, res, next) => {
  // Implementation for future non-repudiation requirements
  next();
};

module.exports = {
  requireRecaptcha,
  verifyTransactionSignature,
};
