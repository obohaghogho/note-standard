const supabase = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

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

        const checks = [];

        if (userId) checks.push(redis.get(`${USER_LOCK_NS}${userId}`));
        if (ip) checks.push(redis.get(`${IP_LOCK_NS}${ip}`));

        const results = await Promise.all(checks);
        return results.some(r => r !== null);
    }

    async _increment(key, ttlSec) {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, ttlSec);
        return count;
    }

    async _lock(key, ttlSec) {
        await redis.setex(key, ttlSec, 'LOCKED');
    }
}

module.exports = new SecurityMonitor();
