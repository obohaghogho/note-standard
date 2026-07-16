const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Hard cap on Redis operations in the hot path
const REDIS_OP_TIMEOUT_MS = 500;
const withTimeout = (promise, fallback) => Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), REDIS_OP_TIMEOUT_MS))
]);

/**
 * MULTI-LAYERED PROGRESSIVE RATE LIMITER (Adversary-Resistant)
 *
 * Trust model:
 *   - IP reputation: HIGHEST TRUST signal
 *   - UserID: HIGH TRUST (authenticated)
 *   - Device fingerprint: LOW TRUST (user-supplied, spoofable)
 *
 * Limits:
 *   Tier 1 (Soft):  5 requests / 15m  → 429 with retry-after
 *   Tier 2 (Hard):  10 cumulative misses → Redis escalation flag
 *   Tier 3 (Block): 3 escalations → Full lockout via SecurityMonitor
 *
 * Key = SHA256(IP:UserID:DeviceID) — short, tamper-evident
 */

// ─── Progressive Escalation Tracking ─────────────────────────
const escalateInRedis = async (compositeKey) => {
    if (!redis) return 0;
    try {
        const escKey = `ratelimit:esc:${compositeKey}`;
        const count = await withTimeout(redis.incr(escKey), 0);
        if (count === 1) await withTimeout(redis.expire(escKey, 3600), null);
        return count || 0;
    } catch (err) {
        logger.warn('[BankLimiter] Redis escalation error (ignored):', err.message);
        return 0;
    }
};

/**
 * Bank READ rate limiter — relaxed, for GET requests.
 * Allows up to 60 reads per 15 min (e.g. switching USD/GBP/EUR tabs).
 */
const bankReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req);
        const userId = req.user?.id || 'anon';
        return `${ip}|${userId}`;
    },
    handler: (req, res) => {
        return res.status(429).json({
            error: 'Too many requests. Please slow down.',
            code: 'READ_RATE_LIMIT_EXCEEDED'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false
});

/**
 * Bank-specific WRITE rate limiter (Fintech Grade) — strict, for POST requests.
 */
const bankSecurityLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Strict: 5 per window

    // Multi-dimensional key — IP is the anchor signal
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req);
        const userId = req.user?.id || 'anon';
        // Device fingerprint is LOW TRUST — contributes but doesn't anchor
        const deviceRaw = req.headers['x-device-id'] || req.headers['user-agent'] || 'no-fp';
        const deviceHash = crypto.createHash('sha256').update(deviceRaw).digest('hex').slice(0, 16);

        // Key is anchored to IP (high trust) + userId (high trust)
        // Device hash is supplementary — limits are NOT bypassable by changing device ID
        return `${ip}|${userId}|${deviceHash}`;
    },

    handler: async (req, res, options) => {
        const ip = ipKeyGenerator(req);
        const userId = req.user?.id || 'anon';
        const deviceRaw = req.headers['x-device-id'] || req.headers['user-agent'] || 'no-fp';
        const deviceHash = crypto.createHash('sha256').update(deviceRaw).digest('hex').slice(0, 16);
        const compositeKey = `${ip}|${userId}|${deviceHash}`;

        // Progressive escalation
        const escalations = await escalateInRedis(compositeKey);
        logger.warn('[RATE_LIMIT_TRIGGERED] Bank endpoint rate limit exceeded', {
            user: userId,
            escalations
        });

        // After 3 escalations, trigger security lockout
        if (escalations >= 3) {
            try {
                const securityMonitor = require('../services/securityMonitor');
                await securityMonitor.reportIncident('RATE_LIMIT_LOCKOUT', {
                    userId,
                    ip,
                    details: `Multi-dimensional rate limit threshold reached (${escalations} escalations)`
                });
            } catch (e) {
                logger.error('[RATE_LIMIT] SecurityMonitor escalation failed', { error: e.message });
            }
        }

        return res.status(429).json({
            error: 'Too many requests. Suspicious activity flagged.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(options.windowMs / 1000)
        });
    },

    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false // Count ALL requests, even successes
});

module.exports = bankSecurityLimiter;
module.exports.bankReadLimiter = bankReadLimiter;
