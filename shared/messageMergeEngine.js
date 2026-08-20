// Compiled CommonJS mirror for backend & server-side test integration of messageMergeEngine

function getEventKey(m) {
    return m.event_id || m.eventId || m.client_event_id || m.client_request_id || m.clientRequestId;
}

function mergeMessages(existing, incoming) {
    const byId = new Map();
    const byEvent = new Map();

    for (const msg of existing) {
        byId.set(msg.id, msg);
        const evtKey = getEventKey(msg);
        if (evtKey) {
            byEvent.set(evtKey, msg);
        }
    }

    let newlyAddedCount = 0;

    for (const msg of incoming) {
        const incomingEvtKey = getEventKey(msg);
        let existingMsg = (incomingEvtKey && byEvent.get(incomingEvtKey)) || byId.get(msg.id);

        if (!existingMsg) {
            for (const existingItem of byId.values()) {
                if (
                    existingItem.id.startsWith('temp-') &&
                    existingItem.sender_id === msg.sender_id &&
                    existingItem.content === msg.content &&
                    Math.abs(new Date(existingItem.created_at).getTime() - new Date(msg.created_at).getTime()) < 15000
                ) {
                    existingMsg = existingItem;
                    break;
                }
            }
        }

        if (!existingMsg) {
            newlyAddedCount++;
            byId.set(msg.id, msg);
            if (incomingEvtKey) byEvent.set(incomingEvtKey, msg);
            continue;
        }

        const existingSeq = existingMsg.sequence_number ?? -1;
        const incomingSeq = msg.sequence_number ?? -1;

        if (incomingSeq >= existingSeq) {
            const updatedMsg = { ...existingMsg, ...msg };
            if (existingMsg.id.startsWith('temp-') && !msg.id.startsWith('temp-')) {
                byId.delete(existingMsg.id);
            }
            byId.set(msg.id, updatedMsg);
            if (incomingEvtKey) byEvent.set(incomingEvtKey, updatedMsg);
        }
    }

    const merged = Array.from(byId.values()).sort((a, b) => {
        const seqA = a.sequence_number ?? Number.MAX_SAFE_INTEGER;
        const seqB = b.sequence_number ?? Number.MAX_SAFE_INTEGER;
        if (seqA !== seqB) return seqA - seqB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return { merged, newlyAddedCount };
}

module.exports = {
    getEventKey,
    mergeMessages
};
