/**
 * ZERO-TRUST RESPONSE ALLOWLIST GUARD (Upgraded)
 *
 * Architecture: ALLOWLIST (not blocklist)
 * - ONLY explicitly permitted fields are allowed through.
 * - Unknown fields are silently dropped.
 * - Known sensitive keys trigger SECURITY_CRITICAL log.
 *
 * This is mounted per-route on sensitive namespaces.
 */
const logger = require('../utils/logger');

// Per-endpoint allowed output schemas (strict allowlist)
const ENDPOINT_SCHEMAS = {
    'GET /api/bank-account': ['id', 'currency', 'account_holder', 'account_number', 'iban_last4', 'bank_name', 'payment_schemes', 'settlement_info', 'updated_at'],
    'POST /api/bank-account': ['id', 'currency', 'account_holder', 'account_number', 'iban_last4', 'bank_name', 'payment_schemes', 'settlement_info', 'updated_at'],
    // Generic safe-response fields for error/message-only responses
    'GENERIC': ['error', 'message', 'code', 'success', 'timestamp', 'path']
};

// Absolute hard-blocked keys — always detected and escalated regardless of schema
const KNOWN_SENSITIVE_KEYS = new Set([
    'encrypted_payload', 'iv', 'auth_tag', 'key_id',
    'iban', 'swift', 'swift_code', 'sort_code',
    'ach_routing', 'wire_routing', 'routing_number',
    'pin', 'cvv', 'card_number', 'password', 'token', 'secret'
]);

/**
 * Detects if an unknown key resembles a sensitive pattern
 * by checking for common financial/crypto substrings.
 */
const resemblesSensitive = (key) => {
    const patterns = ['encrypt', 'decrypt', 'cipher', 'hash', 'key', 'secret', 'token', 'auth', 'iban', 'swift', 'routing', 'account', 'card'];
    const lk = key.toLowerCase();
    return patterns.some(p => lk.includes(p));
};

/**
 * Filters a response object to only allow fields in the allowlist.
 * Detects and logs any breach attempts.
 */
const enforceAllowlist = (body, allowedFields, routeKey) => {
    if (!body || typeof body !== 'object') return body;
    if (Array.isArray(body)) return body.map(item => enforceAllowlist(item, allowedFields, routeKey));

    const clean = {};
    for (const [key, value] of Object.entries(body)) {
        const lk = key.toLowerCase();

        // Always detect hard-blocked keys
        if (KNOWN_SENSITIVE_KEYS.has(lk)) {
            logger.error(`[SECURITY_BREACH] Output allowlist violation: hard-blocked key '${key}' detected on ${routeKey}`);
            continue; // Drop silently but escalate
        }

        // Detect suspicious unknown keys
        if (!allowedFields.includes(key)) {
            if (resemblesSensitive(key)) {
                logger.error(`[SECURITY_BREACH] Output allowlist violation: suspected sensitive key '${key}' dropped on ${routeKey}`);
            }
            // Drop all unlisted fields regardless
            continue;
        }

        // Pass-through allowed scalar fields; recursively apply to objects
        if (typeof value === 'object' && value !== null) {
            clean[key] = value; // Shallow pass-through for safe sub-objects (arrays, dates)
        } else {
            clean[key] = value;
        }
    }

    return clean;
};

/**
 * responseGuard middleware factory
 * @param {string} endpointKey - Key into ENDPOINT_SCHEMAS, or 'GENERIC'
 */
const responseGuard = (endpointKey) => (req, res, next) => {
    const routeKey = endpointKey || `${req.method} ${req.route?.path || req.path}`;
    const allowedFields = ENDPOINT_SCHEMAS[routeKey] || ENDPOINT_SCHEMAS['GENERIC'];

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function (body) {
        // Skip enforcement for non-object payloads (status-only)
        if (!body || typeof body !== 'object') return originalJson(body);

        // Enforce allowlist
        const guarded = enforceAllowlist(body, allowedFields, routeKey);
        return originalJson(guarded);
    };

    res.send = function (body) {
        if (body && typeof body === 'object') {
            const guarded = enforceAllowlist(body, allowedFields, routeKey);
            return originalSend(guarded);
        }
        return originalSend(body);
    };

    next();
};

module.exports = responseGuard;
