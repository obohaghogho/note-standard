const crypto = require('crypto');
const redis = require('../config/redis');
const logger = require('../utils/logger');

const SERVICE_HMAC_SECRET = process.env.INTERNAL_SERVICE_SECRET || process.env.JWT_SECRET;
const SERVICE_NONCE_NS = 'svc:nonce:';
const SERVICE_NONCE_TTL = 60; // 60 second window for internal calls

/**
 * SERVICE-TO-SERVICE AUTHENTICATION
 *
 * Architecture: Zero-trust between internal services.
 *
 * Every internal call must include:
 *   x-service-ts:    Unix ms timestamp
 *   x-service-nonce: Unique random hex
 *   x-service-sig:   HMAC-SHA256(method + path + body_hash + ts + nonce, SECRET)
 *
 * Enforcement:
 *   - Timestamp window validated (60s)
 *   - Nonce consumed atomically in Redis (replay protection)
 *   - HMAC verified with constant-time comparison
 */

/**
 * Generates auth headers for outbound internal service calls.
 */
const signInternalRequest = (method, path, body = {}) => {
    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const bodyHash = crypto.createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex');

    const canonical = `${method.toUpperCase()}:${path}:${bodyHash}:${ts}:${nonce}`;
    const signature = crypto.createHmac('sha256', SERVICE_HMAC_SECRET)
        .update(canonical)
        .digest('hex');

    return {
        'x-service-ts': ts,
        'x-service-nonce': nonce,
        'x-service-sig': signature
    };
};

/**
 * Express middleware: validates incoming internal service requests.
 * Mount on /api/internal/* or any internal-facing route.
 */
const requireServiceAuth = async (req, res, next) => {
    const ts = req.headers['x-service-ts'];
    const nonce = req.headers['x-service-nonce'];
    const sig = req.headers['x-service-sig'];

    const reject = (reason) => {
        logger.error('[SECURITY_CRITICAL] Internal service auth failure', { reason, path: req.path });
        return res.status(401).json({ error: 'Unauthorized internal request', code: 'SERVICE_AUTH_FAILED' });
    };

    if (!ts || !nonce || !sig) return reject('MISSING_SERVICE_HEADERS');

    // 1. Timestamp window
    const age = Math.abs(Date.now() - parseInt(ts, 10));
    if (age > SERVICE_NONCE_TTL * 1000) return reject('REQUEST_EXPIRED');

    // 2. Atomic nonce consumption
    if (redis) {
        const key = `${SERVICE_NONCE_NS}${nonce}`;
        const set = await redis.set(key, '1', 'NX', 'EX', SERVICE_NONCE_TTL);
        if (set === null) return reject('NONCE_REPLAY');
    }

    // 3. HMAC Verification
    const bodyHash = crypto.createHash('sha256')
        .update(JSON.stringify(req.body || {}))
        .digest('hex');

    const canonical = `${req.method.toUpperCase()}:${req.path}:${bodyHash}:${ts}:${nonce}`;
    const expected = crypto.createHmac('sha256', SERVICE_HMAC_SECRET)
        .update(canonical)
        .digest('hex');

    try {
        const sigBuf = Buffer.from(sig, 'hex');
        const expBuf = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return reject('SIGNATURE_MISMATCH');
        }
    } catch {
        return reject('SIGNATURE_PARSE_ERROR');
    }

    next();
};

module.exports = { signInternalRequest, requireServiceAuth };
