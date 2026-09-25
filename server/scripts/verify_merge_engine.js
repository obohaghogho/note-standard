/**
 * verify_merge_engine.js
 * Verification test suite for messageMergeEngine.ts
 */

// Simple JS implementation matching shared/messageMergeEngine.ts logic for execution in Node environment
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
    const matchedTempIds = new Set();

    for (const msg of incoming) {
        const incomingEvtKey = getEventKey(msg);
        let existingMsg = (incomingEvtKey && byEvent.get(incomingEvtKey)) || byId.get(msg.id);

        if (!existingMsg) {
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

        const existingSeq = existingMsg.sequence_number ?? -1;
        const incomingSeq = msg.sequence_number ?? -1;

        if (incomingSeq >= existingSeq || existingMsg.id.startsWith('temp-')) {
            const updatedMsg = { ...existingMsg, ...msg };
            delete updatedMsg._optimistic;

            const STATUS_HIERARCHY = ['sending', 'sent', 'delivered', 'read'];
            const existingStatusRank = STATUS_HIERARCHY.indexOf(existingMsg.status ?? 'sending');
            const incomingStatusRank = STATUS_HIERARCHY.indexOf(msg.status ?? 'sending');
            if (existingStatusRank > incomingStatusRank) {
                updatedMsg.status = existingMsg.status;
            }
            if (existingMsg.delivered_at && !msg.delivered_at) {
                updatedMsg.delivered_at = existingMsg.delivered_at;
            }
            if (existingMsg.read_at && !msg.read_at) {
                updatedMsg.read_at = existingMsg.read_at;
            }

            if (!updatedMsg.reply_to?.id && existingMsg.reply_to?.id) {
                updatedMsg.reply_to = existingMsg.reply_to;
            }

            if (existingMsg.id.startsWith('temp-') && !msg.id.startsWith('temp-')) {
                byId.delete(existingMsg.id);
            }

            if (!msg.id.startsWith('temp-')) {
                for (const [orphanId, orphanMsg] of byId.entries()) {
                    if (
                        orphanId.startsWith('temp-') &&
                        orphanMsg.sender_id === msg.sender_id &&
                        orphanMsg.content === msg.content
                    ) {
                        byId.delete(orphanId);
                    }
                }
            }
            
            byId.set(updatedMsg.id, updatedMsg);
            const updatedEvtKey = getEventKey(updatedMsg);
            if (updatedEvtKey) byEvent.set(updatedEvtKey, updatedMsg);
        }
    }

    const mergedArray = Array.from(byId.values());
    mergedArray.sort((a, b) => {
        const seqA = (a.sequence_number !== undefined && a.sequence_number > 0) ? a.sequence_number : -1;
        const seqB = (b.sequence_number !== undefined && b.sequence_number > 0) ? b.sequence_number : -1;

        if (seqA !== -1 && seqB !== -1) return seqA - seqB;
        if (seqA !== -1) return -1;
        if (seqB !== -1) return 1;

        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;

        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return {
        merged: mergedArray,
        newlyAddedCount
    };
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`PASS: ${testName}`);
        passed++;
    } else {
        console.error(`FAIL: ${testName}`);
        failed++;
    }
}

console.log("=== RUNNING MERGE ENGINE REPAIR VERIFICATION TESTS ===\n");

// Test 1: Bug B - Both sequenced
{
    const existing = [
        { id: 'm2', sequence_number: 102, created_at: '2026-09-25T03:00:02Z', content: 'two', sender_id: 'u1' },
        { id: 'm1', sequence_number: 101, created_at: '2026-09-25T03:00:01Z', content: 'one', sender_id: 'u1' }
    ];
    const res = mergeMessages(existing, []);
    assert(res.merged[0].id === 'm1' && res.merged[1].id === 'm2', 'Test 1: Sorts by sequence ascending when both sequenced');
}

// Test 2: Bug B - One sequenced, one unsequenced
{
    const existing = [
        { id: 'temp-1', created_at: '2026-09-25T03:00:00Z', content: 'optimistic', sender_id: 'u1' },
        { id: 'm1', sequence_number: 101, created_at: '2026-09-25T03:00:05Z', content: 'confirmed', sender_id: 'u1' }
    ];
    const res = mergeMessages(existing, []);
    assert(res.merged[0].id === 'm1' && res.merged[1].id === 'temp-1', 'Test 2: Sequenced message sorted ahead of unsequenced optimistic message');
}

// Test 3: Bug B - Sub-second timestamps tiebroken deterministically by ID
{
    const existing = [
        { id: 'msg-b', created_at: '2026-09-25T03:00:00.100Z', content: 'b', sender_id: 'u1' },
        { id: 'msg-a', created_at: '2026-09-25T03:00:00.100Z', content: 'a', sender_id: 'u1' }
    ];
    const res = mergeMessages(existing, []);
    assert(res.merged[0].id === 'msg-a' && res.merged[1].id === 'msg-b', 'Test 3: Identical timestamps tiebroken deterministically by message ID');
}

// Test 4: Bug C - 5-second content match window (within 5s matches)
{
    const existing = [
        { id: 'temp-1', created_at: '2026-09-25T03:00:00Z', content: 'Hello', sender_id: 'u1' }
    ];
    const incoming = [
        { id: 'srv-1', created_at: '2026-09-25T03:00:02Z', content: 'Hello', sender_id: 'u1', sequence_number: 50 }
    ];
    const res = mergeMessages(existing, incoming);
    assert(res.merged.length === 1 && res.merged[0].id === 'srv-1', 'Test 4: Content match within 5s replaces temp ID with server ID');
}

// Test 5: Bug C - 5-second content match window (outside 5s does NOT match)
{
    const existing = [
        { id: 'temp-1', created_at: '2026-09-25T03:00:00Z', content: 'Hello', sender_id: 'u1' }
    ];
    const incoming = [
        { id: 'srv-1', created_at: '2026-09-25T03:00:10Z', content: 'Hello', sender_id: 'u1', sequence_number: 50 }
    ];
    const res = mergeMessages(existing, incoming);
    assert(res.merged.length === 2, 'Test 5: Content match > 5s apart does not match (treated as new message)');
}

// Test 6: Bug C - matchedTempIds guard prevents double match on duplicate rapid content
{
    const existing = [
        { id: 'temp-1', created_at: '2026-09-25T03:00:00Z', content: 'ok', sender_id: 'u1' },
        { id: 'temp-2', created_at: '2026-09-25T03:00:01Z', content: 'ok', sender_id: 'u1' }
    ];
    const incoming = [
        { id: 'srv-1', created_at: '2026-09-25T03:00:00Z', content: 'ok', sender_id: 'u1', sequence_number: 51 },
        { id: 'srv-2', created_at: '2026-09-25T03:00:01Z', content: 'ok', sender_id: 'u1', sequence_number: 52 }
    ];
    const res = mergeMessages(existing, incoming);
    const tempCount = res.merged.filter(m => m.id.startsWith('temp-')).length;
    assert(res.merged.length === 2 && tempCount === 0, 'Test 6: Rapid duplicate messages "ok" correlate cleanly without collision');
}

// Test 7: Status rank hierarchy preservation (delivered -> sent does not revert)
{
    const existing = [
        { id: 'srv-1', sequence_number: 10, status: 'delivered', delivered_at: '2026-09-25T03:00:01Z', content: 'hi', sender_id: 'u1', created_at: '2026-09-25T03:00:00Z' }
    ];
    const incoming = [
        { id: 'srv-1', sequence_number: 10, status: 'sent', content: 'hi', sender_id: 'u1', created_at: '2026-09-25T03:00:00Z' }
    ];
    const res = mergeMessages(existing, incoming);
    assert(res.merged[0].status === 'delivered' && res.merged[0].delivered_at === '2026-09-25T03:00:01Z', 'Test 7: Delivered status and timestamp preserved against stale incoming echo');
}

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
