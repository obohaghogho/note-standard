/**
 * replayGuard.js — Server-Side Replay Protection Window
 *
 * Prevents delayed or replayed websocket packets from being broadcast
 * to clients after a reconnect storm or network partition.
 *
 * Rules:
 * - Tracks the highest seen sequence_number per conversation in memory
 * - Rejects any broadcast where sequence_number < (highest_seen - REPLAY_WINDOW)
 * - Window default: 5 (configurable via REPLAY_PROTECTION_WINDOW env)
 * - TTL: conversation entries expire after CONVERSATION_TTL_MS of inactivity
 *
 * This does NOT replace database-level idempotency (handled by RPC constraint).
 * This is an additional real-time broadcast guard to prevent UI ghost messages.
 */

const REPLAY_WINDOW = parseInt(process.env.REPLAY_PROTECTION_WINDOW || '5', 10);
const CONVERSATION_TTL_MS = 10 * 60 * 1000; // 10 minutes of inactivity drops the entry

/**
 * Map<conversationId, { highestSeq: number, lastSeen: number }>
 */
const conversationSequences = new Map();

// Periodically clean up stale conversation entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [convId, entry] of conversationSequences.entries()) {
        if (now - entry.lastSeen > CONVERSATION_TTL_MS) {
            conversationSequences.delete(convId);
        }
    }
}, 5 * 60 * 1000);

const replayGuard = {
    /**
     * Checks if an event's sequence_number is safe to broadcast.
     *
     * @param {string} conversationId
     * @param {number} sequenceNumber
     * @returns {{ allowed: boolean, reason?: string }}
     */
    check(conversationId, sequenceNumber) {
        if (!conversationId) {
            return { allowed: false, reason: 'MISSING_CONVERSATION_ID' };
        }

        if (typeof sequenceNumber !== 'number' || isNaN(sequenceNumber)) {
            // No sequence number — allow but don't track (legacy path)
            return { allowed: true };
        }

        const now = Date.now();
        const entry = conversationSequences.get(conversationId);

        if (!entry) {
            // First event for this conversation — always allow, start tracking
            conversationSequences.set(conversationId, {
                highestSeq: sequenceNumber,
                lastSeen: now
            });
            return { allowed: true };
        }

        // Refresh last-seen timestamp
        entry.lastSeen = now;

        // Check if this is a stale replay
        const replayThreshold = entry.highestSeq - REPLAY_WINDOW;
        if (sequenceNumber < replayThreshold) {
            return {
                allowed: false,
                reason: `STALE_REPLAY: seq ${sequenceNumber} < threshold ${replayThreshold} (highest: ${entry.highestSeq})`
            };
        }

        // Advance the high-water mark if this is a newer sequence
        if (sequenceNumber > entry.highestSeq) {
            entry.highestSeq = sequenceNumber;
        }

        return { allowed: true };
    },

    /**
     * Forcibly advances the high-water mark for a conversation.
     * Call this after a confirmed message delivery (e.g. RPC insert).
     */
    advance(conversationId, sequenceNumber) {
        if (!conversationId || typeof sequenceNumber !== 'number') return;
        const entry = conversationSequences.get(conversationId);
        if (!entry || sequenceNumber > entry.highestSeq) {
            conversationSequences.set(conversationId, {
                highestSeq: sequenceNumber,
                lastSeen: Date.now()
            });
        }
    },

    /**
     * Resets a conversation's sequence tracking.
     * Call this after a confirmed reconnect handshake to allow a full replay.
     */
    reset(conversationId) {
        conversationSequences.delete(conversationId);
    },

    /** For diagnostics/deploy-gate inspection */
    getStats() {
        return {
            tracked_conversations: conversationSequences.size,
            replay_window: REPLAY_WINDOW
        };
    }
};

module.exports = replayGuard;
