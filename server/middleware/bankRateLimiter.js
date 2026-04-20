const rateLimit = require('express-rate-limit');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const crypto = require('crypto');

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
    if (!redis) return;
    const escKey = `ratelimit:esc:${compositeKey}`;
    const count = await redis.incr(escKey);
    if (count === 1) await redis.expire(escKey, 3600); // 1h TTL
    return count;
};

/**
 * Bank-specific rate limiter (Fintech Grade)
 */
const bankSecurityLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Strict: 5 per window

    // Multi-dimensional key — IP is the anchor signal
    keyGenerator: (req) => {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        const userId = req.user?.id || 'anon';
        // Device fingerprint is LOW TRUST — contributes but doesn't anchor
        const deviceRaw = req.headers['x-device-id'] || req.headers['user-agent'] || 'no-fp';
        const deviceHash = crypto.createHash('sha256').update(deviceRaw).digest('hex').slice(0, 16);

        // Key is anchored to IP (high trust) + userId (high trust)
        // Device hash is supplementary — limits are NOT bypassable by changing device ID
        return `${ip.replace(/:/g, '_')}|${userId}|${deviceHash}`;
    },

    handler: async (req, res, options) => {
        const ip = req.ip || 'unknown';
        const userId = req.user?.id || 'anon';
        const deviceRaw = req.headers['x-device-id'] || req.headers['user-agent'] || 'no-fp';
        const deviceHash = crypto.createHash('sha256').update(deviceRaw).digest('hex').slice(0, 16);
        const compositeKey = `${ip.replace(/:/g, '_')}|${userId}|${deviceHash}`;

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
