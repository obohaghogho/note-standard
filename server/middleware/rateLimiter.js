const rateLimit = require("express-rate-limit");

// ── Configurable defaults from environment ──────────────────
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) ||
  15 * 60 * 1000; // 15 min
const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;

/**
 * Standard Auth Limiter
 * Uses env-configured window/max, defaults to 100 req / 15 min
 */
exports.authLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: DEFAULT_MAX,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict Transaction Limiter
 * Increased for development/production balance (50 requests per window)
 */
exports.transactionLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: 50,
  message: { error: "Too many transaction attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Preview Limiter
 * Higher limit for previews (100 per window) as they are called frequently during UI interaction
 */
exports.previewLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: 100,
  message: { error: "Too many preview attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * API General Limiter
 * 2x the default max per window
 */
exports.apiLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: DEFAULT_MAX * 2,
  message: { error: "Too many API requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict Withdrawal Limiter
 * 3 requests per 1 hour to prevent rapid fund draining
 */
exports.withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Withdrawal limit exceeded. Please wait an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * HD Address Generation Limiter
 * 10 requests per 1 hour
 */
exports.hdAddressLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    error: "Address generation limit exceeded. Please try again in an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict Email Limiter
 * Prevents attackers from spamming reset/verification emails
 */
const EMAIL_WINDOW_MIN = parseInt(process.env.EMAIL_RATE_WINDOW_MIN, 10) || 15;
exports.emailLimiter = rateLimit({
  windowMs: EMAIL_WINDOW_MIN * 60 * 1000,
  max: parseInt(process.env.EMAIL_RATE_LIMIT, 10) || 5,
  message: { error: "Too many email requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
