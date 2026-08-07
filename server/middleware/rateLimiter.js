const rateLimit = require("express-rate-limit");

// ── Configurable defaults from environment ──────────────────
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) ||
  15 * 60 * 1000; // 15 min
const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;

const isDev = process.env.NODE_ENV === 'development' || process.env.DISABLE_RATE_LIMIT === 'true';

/**
 * Skip rate limiting on localhost or in development environment
 */
const skipLocalhostOrDev = (req) => {
  if (isDev) return true;
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
};

/**
 * Standard Auth Limiter
 */
exports.authLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: DEFAULT_MAX,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

/**
 * Strict Transaction Limiter
 */
exports.transactionLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: 50,
  message: { error: "Too many transaction attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

/**
 * Preview Limiter
 */
exports.previewLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: 100,
  message: { error: "Too many preview attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

/**
 * API General Limiter
 */
exports.apiLimiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: DEFAULT_MAX * 2,
  message: { error: "Too many API requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

/**
 * Strict Withdrawal Limiter
 */
exports.withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Withdrawal limit exceeded. Please wait an hour." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

/**
 * HD Address Generation Limiter
 */
exports.hdAddressLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    error: "Address generation limit exceeded. Please try again in an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

/**
 * Strict Email Limiter
 */
const EMAIL_WINDOW_MIN = parseInt(process.env.EMAIL_RATE_WINDOW_MIN, 10) || 15;
exports.emailLimiter = rateLimit({
  windowMs: EMAIL_WINDOW_MIN * 60 * 1000,
  max: parseInt(process.env.EMAIL_RATE_LIMIT, 10) || 5,
  message: { error: "Too many email requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

// ── Profile & Community Rate Limiters ──────────────────
exports.reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many reports submitted. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

exports.blockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { error: "Too many block actions. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

exports.uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: "Too many upload attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

exports.followLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 120,
  message: { error: "Too many follow actions. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});

exports.profileViewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: { error: "Rate limit exceeded for profile views." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLocalhostOrDev,
});
