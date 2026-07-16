const crypto = require('crypto');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');
const eventSigner = require('../../utils/eventSigner');

const JOB_NONCE_NS = 'job:nonce:';
const JOB_NONCE_TTL = 3600; // 1 hour — jobs can be queued with longer lag

/**
 * SECURE JOB ENVELOPE FACTORY
 *
 * Wraps any payment job data in a cryptographically signed,
 * idempotency-keyed, nonce-protected envelope.
 *
 * Rules enforced:
 * - Raw financial data MUST be encrypted before job wrapup.
 * - Job payload is HMAC-signed with nonce + timestamp.
 * - Duplicate job execution is blocked via idempotency key in Redis.
 */

/**
 * Wraps a safe (non-sensitive) job payload in a signed, idempotent envelope.
 * @param {string} jobType - Job name identifier
 * @param {object} safePayload - Must NOT contain raw financial data
 * @param {string} idempotencyKey - Caller-supplied dedup key
 */
const createSecureJob = async (jobType, safePayload, idempotencyKey) => {
    if (!idempotencyKey) {
        throw new Error('SECURITY: idempotencyKey is required for all secure jobs');
    }

    // 1. Block raw financial data in job payload
    const FORBIDDEN_JOB_KEYS = ['account_number', 'iban', 'swift', 'sort_code', 'routing_number', 'cvv', 'card_number'];
    const payloadKeys = Object.keys(safePayload).map(k => k.toLowerCase());
    for (const fk of FORBIDDEN_JOB_KEYS) {
        if (payloadKeys.includes(fk)) {
            throw new Error(`SECURITY_CRITICAL: Raw financial data '${fk}' must not be included in job payload`);
        }
    }

    // 2. Sign envelope
    const signed = eventSigner.sign(safePayload);

    return {
        _type: jobType,
        _idempotency_key: idempotencyKey,
        _created_at: Date.now(),
        ...signed
    };
};

/**
 * Validates and consumes a job envelope before processing.
 * Must be called at the START of every worker job handler.
 * @returns {{ valid: boolean, data: object, reason?: string }}
 */
const validateJobEnvelope = async (jobData) => {
    if (!jobData || !jobData._idempotency_key || !jobData._nonce) {
        return { valid: false, reason: 'MISSING_JOB_ENVELOPE_FIELDS' };
    }

    // 1. Idempotency check — block duplicate execution
    if (redis) {
        const idempKey = `job:idem:${jobData._idempotency_key}`;
        const set = await redis.set(idempKey, '1', 'NX', 'EX', JOB_NONCE_TTL);
        if (set === null) {
            logger.warn('[JOB_SECURITY] Duplicate job blocked via idempotency key', { key: jobData._idempotency_key });
            return { valid: false, reason: 'IDEMPOTENT_DUPLICATE' };
        }
    }

    // 2. HMAC + nonce verification via eventSigner
    const { _type, _idempotency_key, _created_at, ...envelope } = jobData;
    const result = await eventSigner.verify(envelope);

    if (!result.valid) {
        logger.error('[SECURITY_CRITICAL] Job signature verification failed', { reason: result.reason });
        return { valid: false, reason: result.reason };
    }

    // 3. Extract clean data (without signature fields)
    const { _sig, _nonce, _ts, ...data } = envelope;

    return { valid: true, data };
};

module.exports = { createSecureJob, validateJobEnvelope };
