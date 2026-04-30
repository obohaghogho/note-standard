const supabase = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

// Hard cap on any single Redis operation to prevent stalling HTTP requests
const REDIS_TIMEOUT_MS = 500;

/**
 * Wraps a Redis promise with a hard timeout.
 * On timeout, resolves with the fallback value (fail-open for lockout checks).
 */
const withRedisTimeout = (promise, fallback = null) => {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), REDIS_TIMEOUT_MS))
    ]);
};

// Lockout Configuration
const LOCKOUT_DURATION_SEC = 1800; // 30 minutes
const INCIDENT_WINDOW_SEC = 3600; // Count incidents within 1 hour
const INCIDENT_THRESHOLD = 3; // Number of CRITICAL incidents before lockout

// Separate namespaces for user and IP lockouts
const USER_INCIDENT_NS = 'sec:incidents:user:';
const IP_INCIDENT_NS = 'sec:incidents:ip:';
const USER_LOCK_NS = 'sec:lock:user:';
const IP_LOCK_NS = 'sec:lock:ip:';

/**
 * ADVERSARY-RESISTANT SECURITY MONITOR
 *
 * Lockout Architecture (Abuse-resistant):
 *   - USER lockout requires: 3+ incidents TRACED TO THE SAME USER
 *   - IP lockout requires: 3+ incidents FROM THE SAME IP
 *   - User account CANNOT be locked by external traffic alone (IP incidents ≠ user lock)
 *   - Multi-signal required for user account suspension
 */
class SecurityMonitor {
    /**
     * Reports a critical security incident with separated lockout logic.
     */
    async reportIncident(type, context) {
        const { userId, ip, details } = context;

        // 1. Persist to audit table
        try {
            await supabase.from('security_audit_logs').insert({
                user_id: userId || null,
                event_type: `CRITICAL_${type}`,
                severity: 'CRITICAL',
                description: `Security boundary breach: ${type}`,
                payload: { ip, details, timestamp: new Date().toISOString() }
            });
        } catch (err) {
            logger.error('[SecurityMonitor] Audit persistence failure', { error: err.message });
        }

        // 2. Progressive Incident Tracking (separated: user vs IP)
        if (redis) {
            // Track user-level incidents separately from IP incidents
            const userIncCount = userId ? await this._increment(`${USER_INCIDENT_NS}${userId}`, INCIDENT_WINDOW_SEC) : 0;
            const ipIncCount = await this._increment(`${IP_INCIDENT_NS}${ip}`, INCIDENT_WINDOW_SEC);

            // User lockout: only if the same USER triggers the threshold
            // (prevents DoS-by-lockout via external replay attacks on user's endpoint)
            if (userId && userIncCount >= INCIDENT_THRESHOLD) {
                await this._lock(`${USER_LOCK_NS}${userId}`, LOCKOUT_DURATION_SEC);
                logger.warn('[SECURITY_LOCKOUT] User account locked for 30m', { user: userId });
            }

            // IP lockout: independent of user — blocks the network source
            if (ipIncCount >= INCIDENT_THRESHOLD) {
                await this._lock(`${IP_LOCK_NS}${ip}`, LOCKOUT_DURATION_SEC);
                logger.warn('[SECURITY_LOCKOUT] IP blocked for 30m', { ip });
            }
        }

        logger.error(`[SECURITY_CRITICAL] ${type}`, { user: userId, ip });
    }

    /**
     * Checks lockout status.
     * isLockedOut returns true ONLY if:
     *   - The USER's own incident count exceeded the threshold (user lock)
     *   - OR the IP is locked (network source block)
     *
     * External traffic cannot lock the USER account by itself.
     */
    async isLockedOut(userId, ip) {
        if (!redis) return false;

        try {
            const checks = [];

            if (userId) checks.push(withRedisTimeout(redis.get(`${USER_LOCK_NS}${userId}`), null));
            if (ip) checks.push(withRedisTimeout(redis.get(`${IP_LOCK_NS}${ip}`), null));

            const results = await Promise.all(checks);
            return results.some(r => r !== null);
        } catch (err) {
            // Fail-open: Redis failure should not block user access
            logger.warn('[SecurityMonitor] isLockedOut Redis error (fail-open):', err.message);
            return false;
        }
    }

    async _increment(key, ttlSec) {
        try {
            const count = await withRedisTimeout(redis.incr(key), 1);
            if (count === 1) await withRedisTimeout(redis.expire(key, ttlSec), null);
            return count;
        } catch (err) {
            logger.warn('[SecurityMonitor] _increment Redis error:', err.message);
            return 1;
        }
    }

    async _lock(key, ttlSec) {
        await redis.setex(key, ttlSec, 'LOCKED');
    }
}

module.exports = new SecurityMonitor();
