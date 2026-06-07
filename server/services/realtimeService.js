const { Pool } = require('pg');
require('dotenv').config();
const eventSigner = require('../utils/eventSigner');
const logger = require('../utils/logger');
const diagnosticLogger = require('../utils/diagnosticLogger');
const replayGuard = require('../utils/replayGuard');

// Single pg pool shared with the rest of the server for pg_notify dispatch.
// HTTP fallback removed — it leaked the internal gateway URL and was unreliable
// under load. pg_notify is the authoritative, secure dispatch path.
let pgPool;

if (process.env.DATABASE_URL) {
    let notifyUrl = process.env.DATABASE_URL;
    if (notifyUrl.includes(':6543')) {
        console.warn('[RealtimeService] ⚠ DATABASE_URL uses port 6543. NOTIFY requires session mode. Auto-switching to port 5432...');
        notifyUrl = notifyUrl.replace(':6543', ':5432');
    }

    pgPool = new Pool({
        connectionString: notifyUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });
    pgPool.on('error', (err) => {
        logger.error('[RealtimeService] PostgreSQL Pool Error', { error: err.message });
    });
} else {
    logger.warn('[RealtimeService] DATABASE_URL not set — realtime events will be silently dropped');
}

/**
 * REALTIME EVENT FIREWALL
 *
 * Every outbound event is:
 * 1. Inspected for sensitive keys (blocklist + pattern matching)
 * 2. Schema-validated (only allowlisted fields transmitted)
 * 3. HMAC-signed with nonce for integrity + replay protection
 * 4. Isolated in a dedicated namespace for financial events
 *
 * Any violation → emit is silently blocked + SECURITY event logged.
 */

// Absolute blocklist — must never appear in any event payload
const FINANCIAL_BLOCKLIST = new Set([
    'encrypted_payload', 'iv', 'auth_tag', 'key_id',
    'iban', 'swift', 'swift_code', 'sort_code', 'routing_number',
    'account_number_raw', 'pin', 'cvv'
]);

// Allowed fields for financial event payloads (strict allowlist)
const FINANCIAL_EVENT_ALLOWLIST = new Set([
    'currency', 'account_holder', 'account_number', 'iban_last4',
    'bank_name', 'payment_schemes', 'settlement_info', 'updated_at',
    'event_type', 'status', 'message', '_sig', '_nonce', '_ts'
]);

/**
 * Validates payload safety — blocklist check + allowlist enforcement
 */
const validateEventPayload = (payload, isFinancial) => {
    if (!payload || typeof payload !== 'object') return { safe: false, reason: 'INVALID_PAYLOAD_TYPE' };

    const check = (obj, depth = 0) => {
        if (depth > 5) return { safe: false, reason: 'PAYLOAD_DEPTH_EXCEEDED' };
        for (const [key, value] of Object.entries(obj)) {
            const lk = key.toLowerCase();

            // Hard blocklist check
            if (FINANCIAL_BLOCKLIST.has(lk)) {
                return { safe: false, reason: `BLOCKED_FIELD:${key}` };
            }

            // Unmasked account number heuristic
            if (lk === 'account_number' && typeof value === 'string' && !value.startsWith('****')) {
                return { safe: false, reason: 'UNMASKED_ACCOUNT_NUMBER' };
            }

            // Financial events require strict allowlist
            if (isFinancial && !FINANCIAL_EVENT_ALLOWLIST.has(key)) {
                return { safe: false, reason: `UNLISTED_FIELD_IN_FINANCIAL_EVENT:${key}` };
            }

            // Recurse into nested objects
            if (typeof value === 'object' && value !== null) {
                const nested = check(value, depth + 1);
                if (!nested.safe) return nested;
            }
        }
        return { safe: true };
    };

    return check(payload);
};

/**
 * Core emit — enforces all security rules before dispatch.
 */
const emit = async (type, room, event, payload, options = {}) => {
    try {
        const isFinancial = options.isFinancial === true;
        const excludeUserId = options.excludeUserId || null;

        // 1. Firewall validation
        const validation = validateEventPayload(payload, isFinancial);
        if (!validation.safe) {
            logger.error('[SECURITY_FIREWALL] Realtime event blocked', { reason: validation.reason, event });
            return; // Fail-closed — do not emit
        }

        // 2. Sign financial events with HMAC + nonce
        let protectedPayload = payload;
        let targetRoom = room;

        if (isFinancial) {
            protectedPayload = eventSigner.sign(payload);
            // Isolate financial events into dedicated namespace
            targetRoom = `financial:${room}`;
        }

        const envelope = { type, room: targetRoom, event, payload: protectedPayload };
        // Pass the sender exclusion hint to the gateway dispatcher
        if (excludeUserId) {
            envelope.exclude_user_id = excludeUserId;
        }
        if (options.users) {
            envelope.users = options.users;
        }
        const payloadString = JSON.stringify(envelope);

        // 3. Size guard — prevent oversized payloads
        if (payloadString.length > 6000) {
            logger.warn('[RealtimeService] Event payload too large — blocked', { event, size: payloadString.length });
            return;
        }

        // 3a. Replay protection guard — WARN ONLY for chat:message so delivery is never silently dropped.
        // Dropping on sequence mismatch caused real messages to be lost when DB sequence was behind.
        if (payload && typeof payload.sequence_number === 'number' && event !== 'chat:message') {
            const convId = payload.conversation_id || payload.conversationId;
            const replayCheck = replayGuard.check(convId, payload.sequence_number);
            if (!replayCheck.allowed) {
                logger.warn('[RealtimeService] Replay guard triggered (non-fatal for chat)', {
                    event,
                    conversation_id: convId,
                    reason: replayCheck.reason
                });
                // Do NOT return — continue dispatch so the client always receives the message
            }
        }

        // 4. Dispatch via pg_notify (the single authoritative path)
        if (pgPool) {
            // DIAGNOSTICS LOGGING
            diagnosticLogger.logEvent(event, payload, { 
                room: targetRoom, 
                isFinancial,
                platform: 'server-gateway'
            });

            console.log(`[RealtimeService] 📤 Dispatching ${event} via pg_notify → type=${type} room=${targetRoom || 'N/A'} users=${options.users?.length ?? 0}`);
            await pgPool.query('SELECT pg_notify($1, $2)', ['realtime_events', payloadString]);
        } else {
            logger.warn('[RealtimeService] pgPool unavailable — realtime event dropped', { event });
        }
    } catch (err) {
        // Fail-closed — never propagate emit errors to caller
        logger.error('[RealtimeService] Emit failure (blocked, not propagated)', { error: err.message });
    }
};

const emitToUser = (userId, event, payload, options = {}) =>
    emit('to_user', userId, event, payload, options);

const emitToUsers = (userIds, event, payload, options = {}) =>
    emit('to_users', null, event, payload, { ...options, users: userIds });

const emitToConversation = (conversationId, event, payload, options = {}) =>
    emit('to_room', conversationId, event, payload, options);


const emitToAdmin = (event, payload, options = {}) =>
    emit('to_room', 'admin', event, payload, options);

const emitFinancialUpdate = (userId, event, payload) =>
    emitToUser(userId, event, payload, { isFinancial: true });

const broadcast = (event, payload) =>
    emit('broadcast', '*', event, payload, { isFinancial: false });

module.exports = { emit, emitToUser, emitToUsers, emitToConversation, emitToAdmin, emitFinancialUpdate, broadcast };
