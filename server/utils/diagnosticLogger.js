/**
 * diagnosticLogger.js — Rate-Limited, Dedup-Protected
 *
 * Guards:
 * - Hash deduplication: identical payloads within 60s are logged ONCE
 * - Per-socket rate limiting: max N events/min per socket_id
 * - Production sampling: only logs a % of events in prod to prevent flooding
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const realtimeLogPath = path.join(LOGS_DIR, 'realtime_diagnostics.log');
const quarantineLogPath = path.join(LOGS_DIR, 'quarantine.log');

// ── Rate Limiting Config ───────────────────────────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REALTIME_SAMPLE_RATE = parseFloat(process.env.DIAG_SAMPLE_RATE || (IS_PRODUCTION ? '0.1' : '1.0')); // 10% in prod
const MAX_EVENTS_PER_SOCKET_PER_MIN = parseInt(process.env.DIAG_RATE_LIMIT || '60', 10);
const QUARANTINE_DEDUP_WINDOW_MS = 60 * 1000; // 60s

// ── In-memory tracking (lightweight, auto-expires) ─────────────────────────
// Map<socket_id, { count: number, resetAt: number }>
const socketRateLimits = new Map();
// Map<hash, expiresAt>
const quarantineDedup = new Map();

// Clean up stale entries periodically (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of socketRateLimits.entries()) {
        if (now > val.resetAt) socketRateLimits.delete(key);
    }
    for (const [hash, expiresAt] of quarantineDedup.entries()) {
        if (now > expiresAt) quarantineDedup.delete(hash);
    }
}, 5 * 60 * 1000);

// ── Helpers ────────────────────────────────────────────────────────────────
const hash = (data) => {
    try {
        return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    } catch {
        return 'hash-error';
    }
};

const isSocketRateLimited = (socketId) => {
    if (!socketId || socketId === 'unknown') return false;
    const now = Date.now();
    const entry = socketRateLimits.get(socketId);

    if (!entry || now > entry.resetAt) {
        socketRateLimits.set(socketId, { count: 1, resetAt: now + 60000 });
        return false;
    }

    if (entry.count >= MAX_EVENTS_PER_SOCKET_PER_MIN) {
        return true; // Rate limited
    }

    entry.count++;
    return false;
};

const shouldSampleEvent = () => {
    if (REALTIME_SAMPLE_RATE >= 1.0) return true;
    return Math.random() < REALTIME_SAMPLE_RATE;
};

const extractMetadata = (payload) => {
    if (!payload || typeof payload !== 'object') return { type: typeof payload };
    return {
        event_id: payload.event_id,
        sequence_number: payload.sequence_number,
        conversation_version: payload.conversation_version,
        server_timestamp: payload.server_timestamp,
        conversation_id: payload.conversation_id || payload.conversationId,
        sender_id: payload.sender_id || payload.userId,
        is_duplicate: payload.is_duplicate,
    };
};

const appendLog = (filePath, entry) => {
    fs.appendFile(filePath, entry + '\n', (err) => {
        if (err) console.error(`[DiagnosticLogger] Write failed: ${filePath}`, err.message);
    });
};

// ── Public API ─────────────────────────────────────────────────────────────
const diagnosticLogger = {
    /**
     * Logs structural topology of a realtime event.
     * Applies sampling + per-socket rate limiting.
     */
    logEvent: (event, payload, options = {}) => {
        try {
            const socketId = options.socket_id || 'unknown';

            // Sampling gate (production traffic reduction)
            if (!shouldSampleEvent()) return;

            // Per-socket rate limiting gate
            if (isSocketRateLimited(socketId)) return;

            const metadata = extractMetadata(payload);
            const entry = JSON.stringify({
                timestamp: new Date().toISOString(),
                event,
                ...metadata,
                receiver_id: options.receiver_id,
                platform: options.platform || 'unknown',
                socket_id: socketId,
                room: options.room
            });

            appendLog(realtimeLogPath, entry);
        } catch (err) {
            console.error('[DiagnosticLogger] logEvent error:', err.message);
        }
    },

    /**
     * Logs a quarantined payload.
     * Applies 60s hash-deduplication to prevent flooding on reconnect storms.
     */
    logQuarantine: (reason, payload, options = {}) => {
        try {
            const payloadHash = hash({ reason, payload });
            const now = Date.now();

            // Dedup gate: same quarantine hash within 60s → skip
            if (quarantineDedup.has(payloadHash)) return;
            quarantineDedup.set(payloadHash, now + QUARANTINE_DEDUP_WINDOW_MS);

            const metadata = extractMetadata(payload);
            const entry = JSON.stringify({
                timestamp: new Date().toISOString(),
                reason,
                raw_hash: payloadHash,
                missing_fields: options.missingFields || [],
                source_socket_id: options.socket_id || 'unknown',
                sender_id: metadata.sender_id || 'unknown',
                platform: options.platform || 'unknown'
            });

            appendLog(quarantineLogPath, entry);
        } catch (err) {
            console.error('[DiagnosticLogger] logQuarantine error:', err.message);
        }
    }
};

module.exports = diagnosticLogger;
