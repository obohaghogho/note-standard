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

import { Message } from '../context/ChatContext';

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

            // Guard: Prevent a null/absent reply_to from the server from wiping an
            // existing optimistic reply context. This handles the PostgREST FK join
            // returning null due to a schema cache miss, migration not yet applied,
            // or the non-transactional path returning the raw row without join resolution.
            if (!updatedMsg.reply_to && existingMsg.reply_to) {
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
