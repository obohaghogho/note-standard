/**
 * messageMergeEngine.ts
 *
 * Phase 3.2 Single Source of Truth Merge Engine
 *
 * Enforces a deterministic 4-stage pipeline for merging messages:
 * 1. Index existing messages by `id` and `event_id`
 * 2. Resolve incoming messages with sequence precedence
 * 3. Sort by sequence_number (fallback to created_at, then id for stability)
 *
 * Bug B fix (2026-09-25): 4-level deterministic sort comparator — eliminates
 *   sub-second ordering inversions when sequence numbers are absent.
 * Bug C fix (2026-09-25): content-match fallback tightened to 5s window with
 *   per-merge matchedTempIds guard — prevents ghost collision on identical content.
 */

export interface Message {
    id: string;
    event_id?: string;
    client_request_id?: string;
    clientRequestId?: string;
    sequence_number?: number;
    _optimistic?: boolean;
    reply_to?: {
        id: string;
        content: string;
        sender_id: string;
    };
    created_at: string;
    content: string;
    sender_id: string;
    [key: string]: any;
}

export interface MergeResult {
    merged: Message[];
    newlyAddedCount: number;
}

function getEventKey(m: Message): string | undefined {
    return m.event_id || m.eventId || m.client_event_id || m.client_request_id || m.clientRequestId;
}

export function mergeMessages(existing: Message[], incoming: Message[]): MergeResult {
    const byId = new Map<string, Message>();
    const byEvent = new Map<string, Message>();

    // Stage 1 & 2: Index existing messages
    for (const msg of existing) {
        byId.set(msg.id, msg);
        const evtKey = getEventKey(msg);
        if (evtKey) {
            byEvent.set(evtKey, msg);
        }
    }

    let newlyAddedCount = 0;

    // Stage 3: Merge incoming
    // Bug C fix: per-merge Set to prevent the same temp- message from being
    // matched by two different incoming server echoes in the same merge pass.
    // Scope: outer loop only — reset per mergeMessages() call (Set is declared here).
    const matchedTempIds = new Set<string>();

    for (const msg of incoming) {
        // Priority 1: match by event_id / clientRequestId (canonical ACK identity)
        // Priority 2: match by id (legacy fallback)
        // Priority 3: content-match fallback (temp- only, 5s window, no double-match)
        const incomingEvtKey = getEventKey(msg);
        let existingMsg = (incomingEvtKey && byEvent.get(incomingEvtKey)) || byId.get(msg.id);

        if (!existingMsg) {
            // Content-matching fallback for optimistic messages whose event_id wasn't returned.
            // BUG C FIX:
            //   - Window tightened from 60 000ms → 5 000ms to prevent cross-message collision
            //     (e.g. user sends "ok" twice within 60s — old code matched the wrong temp-).
            //   - matchedTempIds guards against the second server echo re-using the same temp-
            //     that was already claimed by the first echo in this same merge pass.
            for (const existingItem of byId.values()) {
                if (
                    !matchedTempIds.has(existingItem.id) &&
                    existingItem.id.startsWith('temp-') &&
                    existingItem.sender_id === msg.sender_id &&
                    existingItem.content === msg.content
                ) {
                    const timeDiff = Math.abs(new Date(existingItem.created_at).getTime() - new Date(msg.created_at).getTime());
                    if (!isNaN(timeDiff) && timeDiff < 5000) {
                        existingMsg = existingItem;
                        matchedTempIds.add(existingItem.id);
                        break;
                    }
                }
            }
        }

        if (!existingMsg) {
            newlyAddedCount++;
            byId.set(msg.id, msg);
            if (incomingEvtKey) byEvent.set(incomingEvtKey, msg);
            continue;
        }

        // Conflict resolution: Sequence precedence
        const existingSeq = existingMsg.sequence_number ?? -1;
        const incomingSeq = msg.sequence_number ?? -1;

        if (incomingSeq >= existingSeq || existingMsg.id.startsWith('temp-')) {
            const updatedMsg = { ...existingMsg, ...msg };
            
            // Critical fix: Incoming messages from server/socket are authoritative.
            // If the local message was optimistic, clear it so it doesn't stay stuck.
            delete updatedMsg._optimistic;

            // Chaos audit fix: Server always wins for delivery/read status.
            // A confirmed 'delivered_at' or 'read_at' must NEVER be reverted by a 
            // later optimistic state that doesn't have it (e.g., a stale reconnect echo).
            const STATUS_HIERARCHY = ['sending', 'sent', 'delivered', 'read'];
            const existingStatusRank = STATUS_HIERARCHY.indexOf(existingMsg.status ?? 'sending');
            const incomingStatusRank = STATUS_HIERARCHY.indexOf(msg.status ?? 'sending');
            // Preserve the highest-rank status seen
            if (existingStatusRank > incomingStatusRank) {
                updatedMsg.status = existingMsg.status;
            }
            // Also preserve the most advanced timestamps (they cannot go backwards)
            if (existingMsg.delivered_at && !msg.delivered_at) {
                updatedMsg.delivered_at = existingMsg.delivered_at;
            }
            if (existingMsg.read_at && !msg.read_at) {
                updatedMsg.read_at = existingMsg.read_at;
            }

            // Guard: Prevent a null/absent/empty reply_to from the server from wiping an
            // existing optimistic reply context.
            if (!updatedMsg.reply_to?.id && existingMsg.reply_to?.id) {
                updatedMsg.reply_to = existingMsg.reply_to;
            }

            // If the incoming message has a canonical UUID from the server, 
            // and the existing was a 'temp-' ID, we must update the byId map to reflect the real ID
            // while removing the old temp ID to prevent map bloat/leaks and dual rendering.
            if (existingMsg.id.startsWith('temp-') && !msg.id.startsWith('temp-')) {
                byId.delete(existingMsg.id);
            }

            byId.set(updatedMsg.id, updatedMsg);
            const updatedEvtKey = getEventKey(updatedMsg);
            if (updatedEvtKey) byEvent.set(updatedEvtKey, updatedMsg);

            console.log('[SYNC_FORENSICS]', {
                stage: 'mergeMessages',
                event: 'conflict_resolution',
                messageId: updatedMsg.id,
                incomingReplyTo: msg.reply_to,
                existingReplyTo: existingMsg.reply_to,
                mergedReplyTo: updatedMsg.reply_to,
                payload: msg,
            });
        }

    }

    // Stage 4: Sort — deterministic comparator with sequence_number authority
    //
    // Priority 1: If both messages have valid sequence_number > 0 → ascending sequence_number (DB-authoritative).
    // Priority 2: Primary chronological order — created_at timestamp ASC when timestamps differ.
    // Priority 3: Identical timestamps → sequenced message sorts first.
    // Priority 4: Stable tiebreaker via ascending id string.
    const mergedArray = Array.from(byId.values());
    mergedArray.sort((a, b) => {
        const seqA = (a.sequence_number !== undefined && a.sequence_number > 0) ? Number(a.sequence_number) : -1;
        const seqB = (b.sequence_number !== undefined && b.sequence_number > 0) ? Number(b.sequence_number) : -1;

        // P1: Both have DB-assigned sequence numbers → sequence_number is 100% authoritative
        if (seqA !== -1 && seqB !== -1) {
            return seqA - seqB;
        }

        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();

        if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
            return timeA - timeB;
        }

        // P3: Only one sequenced message with identical timestamp → sequenced message first
        if (seqA !== -1) return -1;
        if (seqB !== -1) return 1;

        // P4: Stable tiebreaker via id string comparison
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return {
        merged: mergedArray,
        newlyAddedCount
    };
}
