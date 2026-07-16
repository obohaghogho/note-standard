/**
 * messageMergeEngine.ts
 *
 * Phase 3.2 Single Source of Truth Merge Engine
 *
 * Enforces a deterministic 3-stage pipeline for merging messages:
 * 1. Index existing messages by `id` and `event_id`
 * 2. Resolve incoming messages with sequence precedence
 * 3. Sort by sequence_number (fallback to created_at)
 */

export interface Message {
    id: string;
    event_id?: string;
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

export function mergeMessages(existing: Message[], incoming: Message[]): MergeResult {
    const byId = new Map<string, Message>();
    const byEvent = new Map<string, Message>();

    // Stage 1 & 2: Index existing messages
    for (const msg of existing) {
        byId.set(msg.id, msg);
        if (msg.event_id) {
            byEvent.set(msg.event_id, msg);
        }
    }

    let newlyAddedCount = 0;

    // Stage 3: Merge incoming
    for (const msg of incoming) {
        // Priority 1: match by event_id (canonical identity)
        // Priority 2: match by id (legacy fallback)
        const existingMsg = (msg.event_id && byEvent.get(msg.event_id)) || byId.get(msg.id);

        if (!existingMsg) {
            newlyAddedCount++;
            byId.set(msg.id, msg);
            if (msg.event_id) byEvent.set(msg.event_id, msg);
            continue;
        }

        // Conflict resolution: Sequence precedence
        const existingSeq = existingMsg.sequence_number ?? -1;
        const incomingSeq = msg.sequence_number ?? -1;

        if (incomingSeq >= existingSeq) {
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
            // existing optimistic reply context. This handles:
            //   - PostgREST FK join returning null (schema cache miss / migration not applied)
            //   - Server normalizer returning {} (empty object after null-stripping)
            //   - Any payload where reply_to exists but lacks a valid id field
            // We check reply_to?.id (not just reply_to) because an empty object {} is
            // truthy but has no id, which would make the reply bubble vanish silently.
            if (!updatedMsg.reply_to?.id && existingMsg.reply_to?.id) {
                updatedMsg.reply_to = existingMsg.reply_to;
            }

            // If the incoming message has a canonical UUID from the server, 
            // and the existing was a 'temp-' ID, we must update the byId map to reflect the real ID
            // while removing the old temp ID to prevent map bloat/leaks.
            if (existingMsg.id.startsWith('temp-') && !msg.id.startsWith('temp-')) {
                byId.delete(existingMsg.id);
            }
            
            byId.set(updatedMsg.id, updatedMsg);
            if (updatedMsg.event_id) byEvent.set(updatedMsg.event_id, updatedMsg);

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

    // Stage 4: Sort
    const mergedArray = Array.from(byId.values());
    mergedArray.sort((a, b) => {
        const seqA = (a.sequence_number !== undefined && a.sequence_number > 0) ? a.sequence_number : -1;
        const seqB = (b.sequence_number !== undefined && b.sequence_number > 0) ? b.sequence_number : -1;
        
        if (seqA !== -1 && seqB !== -1) {
            return seqA - seqB;
        }
        
        // Fallback to timestamp if either is missing a valid sequence number
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeA - timeB;
    });

    return {
        merged: mergedArray,
        newlyAddedCount
    };
}
