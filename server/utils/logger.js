/**
 * STRUCTURED LOGGER — FINTECH HARDENED
 *
 * Security guarantees:
 * - Recursive scrubbing of all context objects before emission
 * - Pattern-based heuristic scrubbing for unknown sensitive-looking keys
 * - Fail-safe: if scrubbing itself fails, log is dropped (never emits raw)
 * - Strings in context are scanned for embedded financial PII
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel =
    LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info;

// Hard blocklist — definitive sensitive keys
const SENSITIVE_KEYS = new Set([
    'account_number', 'iban', 'swift', 'swift_code', 'sort_code',
    'routing_number', 'ach_routing', 'wire_routing',
    'encrypted_payload', 'iv', 'auth_tag', 'key_id',
    'cvv', 'card_number', 'pin', 'password', 'token', 'secret',
    'bank_key', 'private_key', 'passphrase'
]);

// Keys that LOOK sensitive by substring — catch-all heuristic
const SENSITIVE_PATTERNS = ['encrypt', 'decrypt', 'cipher', '_key', '_secret', 'auth_tag', 'iban', 'account_num', 'sort_code', 'swift', 'routing'];

const looksSensitive = (key) => {
    const lk = key.toLowerCase();
    return SENSITIVE_PATTERNS.some(p => lk.includes(p));
};

// Regex for embedded PII in string values (prevent format: "processed account 42075582")
const EMBEDDED_PII_PATTERN = /\b\d{8,20}\b/g;

const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(EMBEDDED_PII_PATTERN, '[REDACTED]');
};

const scrub = (data, depth = 0) => {
    // Prevent infinite recursion on circular refs or very deep objects
    if (depth > 8) return '[DEPTH_LIMIT]';
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') return sanitizeString(data);
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map(item => scrub(item, depth + 1));

    const out = {};
    for (const [key, value] of Object.entries(data)) {
        const lk = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lk) || looksSensitive(key)) {
            out[key] = '[SCRUBBED]';
        } else {
            out[key] = scrub(value, depth + 1);
        }
    }
    return out;
};

/**
 * Fail-safe wrapper: if scrubbing itself throws, return a safe placeholder.
 * Ensures logger NEVER emits raw data even on unexpected object structures.
 */
const safeScrub = (context) => {
    try {
        return scrub(context);
    } catch {
        return { _scrub_error: 'Context sanitization failed — dropped for safety' };
    }
};

const format = (level, message, context) => {
    const safeContext = safeScrub(
        context instanceof Error
            ? { message: context.message }  // Never log stack in production
            : context
    );

    return JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        message: sanitizeString(String(message)),
        ...safeContext
    });
};

const logger = {
    info: (message, context = {}) => {
        if (currentLevel < LOG_LEVELS.info) return;
        console.log(format('INFO', message, context));
    },
    error: (message, context = {}) => {
        console.error(format('ERROR', message, context));
    },
    warn: (message, context = {}) => {
        if (currentLevel < LOG_LEVELS.warn) return;
        console.warn(format('WARN', message, context));
    },
    debug: (message, context = {}) => {
        if (currentLevel < LOG_LEVELS.debug) return;
        if (process.env.NODE_ENV !== 'development') return; // Never in production
        console.log(format('DEBUG', message, context));
    }
};

module.exports = logger;
