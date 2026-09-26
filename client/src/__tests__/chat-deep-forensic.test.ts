import { describe, test } from 'vitest';
import { mergeMessages, Message } from '../../../shared/messageMergeEngine';

describe('Deep Forensic Trace', () => {
  test('Trace rapid send sequence: No, Me, Yes', () => {
    let messages: Message[] = [];

    const logState = (stepName: string) => {
      console.log(`\n--- [STEP: ${stepName}] ---`);
      console.log(`Total messages in state: ${messages.length}`);
      messages.forEach((m, idx) => {
        console.log(`  [${idx}] ID: ${m.id.padEnd(25)} | EventID: ${(m.event_id || 'NONE').padEnd(15)} | Content: "${m.content.padEnd(5)}" | Status: ${(m.status || '').padEnd(8)} | Seq: ${m.sequence_number ?? 'NONE'} | Created: ${m.created_at}`);
      });
    };

    // 1. Send "No" (t=0)
    const evtNo = 'evt-uuid-No';
    const tempNo = 'temp-1727330000000-abc1';
    const optNo: Message = {
      id: tempNo,
      event_id: evtNo,
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'No',
      created_at: '2026-09-26T08:00:00.000Z',
      status: 'sending'
    };
    messages = mergeMessages(messages, [optNo]).merged;
    logState('1. Send "No"');

    // 2. Send "Me" (t=30ms)
    const evtMe = 'evt-uuid-Me';
    const tempMe = 'temp-1727330000030-xyz2';
    const optMe: Message = {
      id: tempMe,
      event_id: evtMe,
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Me',
      created_at: '2026-09-26T08:00:00.030Z',
      status: 'sending'
    };
    messages = mergeMessages(messages, [optMe]).merged;
    logState('2. Send "Me"');

    // 3. Send "Yes" (t=60ms)
    const evtYes = 'evt-uuid-Yes';
    const tempYes = 'temp-1727330000060-uvw3';
    const optYes: Message = {
      id: tempYes,
      event_id: evtYes,
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Yes',
      created_at: '2026-09-26T08:00:00.060Z',
      status: 'sending'
    };
    messages = mergeMessages(messages, [optYes]).merged;
    logState('3. Send "Yes"');

    // 4. HTTP POST for "No" completes (t=100ms)
    // Note: server assigns created_at = 08:00:00.045Z (DB timestamp after insert)
    const srvNo: Message = {
      id: 'srv-No-901',
      event_id: evtNo,
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'No',
      sequence_number: 101,
      created_at: '2026-09-26T08:00:00.045Z',
      status: 'sent'
    };
    let filtered1 = messages.filter(m => m.id !== tempNo && (!m.event_id || m.event_id !== evtNo));
    messages = mergeMessages(filtered1, [srvNo]).merged;
    logState('4. Reconcile "No"');

    // 5. HTTP POST for "Me" completes (t=150ms)
    const srvMe: Message = {
      id: 'srv-Me-902',
      event_id: evtMe,
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Me',
      sequence_number: 102,
      created_at: '2026-09-26T08:00:00.075Z',
      status: 'sent'
    };
    let filtered2 = messages.filter(m => m.id !== tempMe && (!m.event_id || m.event_id !== evtMe));
    messages = mergeMessages(filtered2, [srvMe]).merged;
    logState('5. Reconcile "Me"');

    // 6. HTTP POST for "Yes" completes (t=200ms)
    const srvYes: Message = {
      id: 'srv-Yes-903',
      event_id: evtYes,
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Yes',
      sequence_number: 103,
      created_at: '2026-09-26T08:00:00.095Z',
      status: 'sent'
    };
    let filtered3 = messages.filter(m => m.id !== tempYes && (!m.event_id || m.event_id !== evtYes));
    messages = mergeMessages(filtered3, [srvYes]).merged;
    logState('6. Reconcile "Yes"');
  });
});
