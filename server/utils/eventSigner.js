const crypto = require('crypto');
const redis = require('../config/redis');
const logger = require('../utils/logger');

const SECRET = process.env.JWT_SECRET;

// Dedicated financial nonce namespace in Redis to prevent key collisions
const NONCE_NS = 'fin:nonce:';

// Short-lived TTL (90 seconds) — tight replay window
const NONCE_TTL_SEC = 90;

/**
 * Fintech-Grade Event Signer (Hardened)
 *
 * Security properties:
 * - HMAC-SHA256 signature bound to full payload + nonce + timestamp
 * - Redis atomic SET NX ensures nonce can NEVER be reused
 * - Short 90s TTL prevents long-range replay
 * - Dedicated namespace prevents cross-domain nonce collision
 */
class EventSigner {
    /**
     * Signs a payload for realtime/queue transmission.
     * @param {object} payload - Safe, masked payload
     * @returns {object} Signed envelope with _sig, _nonce, _ts
     */
    sign(payload) {
        if (!SECRET) throw new Error('SECURITY_CRITICAL: JWT_SECRET missing. Event signing unavailable.');

        const nonce = crypto.randomBytes(16).toString('hex');
        const timestamp = Date.now();
        const canonical = JSON.stringify(payload) + nonce + String(timestamp);

        const signature = crypto.createHmac('sha256', SECRET)
            .update(canonical)
            .digest('hex');

        return { ...payload, _sig: signature, _nonce: nonce, _ts: timestamp };
    }

    /**
     * Verifies a signed event payload.
     * @param {object} envelope - Contains _sig, _nonce, _ts + data
     * @returns {{ valid: boolean, reason?: string }}
     */
    async verify(envelope) {
        const { _sig, _nonce, _ts, ...data } = envelope;

        if (!_sig || !_nonce || !_ts) {
            return { valid: false, reason: 'MISSING_SIGNATURE_FIELDS' };
        }

        // 1. Timestamp window (90s strict)
        const age = Math.abs(Date.now() - _ts);
        if (age > NONCE_TTL_SEC * 1000) {
            return { valid: false, reason: 'EVENT_EXPIRED' };
        }

        // 2. Atomic Redis nonce check — SET nonce NX EX ttl
        if (redis) {
            const nonceKey = `${NONCE_NS}${_nonce}`;
            // SET returns 'OK' only if key did NOT exist (NX)
            const set = await redis.set(nonceKey, '1', 'NX', 'EX', NONCE_TTL_SEC);
            if (set === null) {
                // Key already existed — REPLAY DETECTED
                logger.error(`[SECURITY_CRITICAL] Nonce replay detected: ${_nonce}`);
                return { valid: false, reason: 'NONCE_REPLAY' };
            }
        }

        // 3. HMAC Verification (constant-time)
        const canonical = JSON.stringify(data) + _nonce + String(_ts);
        const expected = crypto.createHmac('sha256', SECRET)
            .update(canonical)
            .digest('hex');

        const sigBuf = Buffer.from(_sig, 'hex');
        const expBuf = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return { valid: false, reason: 'SIGNATURE_INVALID' };
        }

        return { valid: true };
    }
}

module.exports = new EventSigner();
