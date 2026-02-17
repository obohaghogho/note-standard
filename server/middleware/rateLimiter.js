const rateLimit = require("express-rate-limit");

/**
 * Standard Auth Limiter
 * 100 requests per 15 minutes
 */
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict Transaction Limiter
 * 10 requests per 15 minutes for high-value actions
 */
exports.transactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many transaction attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * API General Limiter
 * 200 requests per 15 minutes
 */
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many API requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
