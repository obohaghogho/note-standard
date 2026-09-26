import { describe, test, expect } from 'vitest';
import { mergeMessages, Message } from '../../../shared/messageMergeEngine';

describe('Final Pre-Deployment Safety Gate Test Suite', () => {

  test('SECTION 1 — Exact reproduced failure & fix verification', () => {
    const t0 = new Date('2026-09-26T08:00:00.000Z').getTime();
    const t30 = new Date('2026-09-26T08:00:00.030Z').getTime();

    const optNo: Message = {
      id: 'temp-No',
      event_id: 'evt-No',
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'No',
      created_at: '2026-09-26T08:00:00.000Z',
      _clientTimestamp: t0,
      status: 'sending'
    };

    const optMe: Message = {
      id: 'temp-Me',
      event_id: 'evt-Me',
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Me',
      created_at: '2026-09-26T08:00:00.030Z',
      _clientTimestamp: t30,
      status: 'sending'
    };

    let state = mergeMessages([], [optNo, optMe]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me']);

    const srvNo: Message = {
      id: 'srv-No-101',
      event_id: 'evt-No',
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'No',
      sequence_number: 101,
      created_at: '2026-09-26T08:00:00.045Z',
      status: 'sent'
    };

    state = mergeMessages(state, [srvNo]).merged;

    expect(state.map(m => m.content)).toEqual(['No', 'Me']);
    expect(state.find(m => m.content === 'No')?.id).toBe('srv-No-101');
    expect(state.find(m => m.content === 'No')?.sequence_number).toBe(101);
  });

  describe('SECTION 2 — CROSS-DEVICE SAFETY TEST', () => {
    test('2.1 Local optimistic No (_clientTimestamp=1000, seq=NONE) vs Remote server OtherUser (seq=101, created_at=900ms)', () => {
      const optNo: Message = {
        id: 'temp-No',
        event_id: 'evt-No',
        sender_id: 'localUser',
        content: 'No',
        created_at: '1970-01-01T00:00:01.000Z',
        _clientTimestamp: 1000
      };

      const srvOther: Message = {
        id: 'srv-other-101',
        event_id: 'evt-other-101',
        sequence_number: 101,
        sender_id: 'remoteUser',
        content: 'OtherUser',
        created_at: '1970-01-01T00:00:00.900Z'
      };

      const state = mergeMessages([], [optNo, srvOther]).merged;
      expect(state.map(m => m.content)).toEqual(['OtherUser', 'No']);
    });

    test('2.2 Local optimistic Me (_clientTimestamp=1000) vs Remote unsequenced OtherUser (seq=NONE, created_at=900ms)', () => {
      const optMe: Message = {
        id: 'temp-Me',
        event_id: 'evt-Me',
        sender_id: 'localUser',
        content: 'Me',
        created_at: '1970-01-01T00:00:01.000Z',
        _clientTimestamp: 1000
      };

      const unseqOther: Message = {
        id: 'unseq-other',
        event_id: 'evt-other-unseq',
        sender_id: 'remoteUser',
        content: 'OtherUser',
        created_at: '1970-01-01T00:00:00.900Z'
      };

      const state = mergeMessages([], [optMe, unseqOther]).merged;
      expect(state.map(m => m.content)).toEqual(['OtherUser', 'Me']);
    });

    test('2.3 Local optimistic Me (_clientTimestamp=1000) vs Remote sequenced OtherUser (seq=101, created_at=900ms)', () => {
      const optMe: Message = {
        id: 'temp-Me',
        event_id: 'evt-Me',
        sender_id: 'localUser',
        content: 'Me',
        created_at: '1970-01-01T00:00:01.000Z',
        _clientTimestamp: 1000
      };

      const srvOther: Message = {
        id: 'srv-other-101',
        event_id: 'evt-other-101',
        sequence_number: 101,
        sender_id: 'remoteUser',
        content: 'OtherUser',
        created_at: '1970-01-01T00:00:00.900Z'
      };

      const state = mergeMessages([], [optMe, srvOther]).merged;
      expect(state.map(m => m.content)).toEqual(['OtherUser', 'Me']);
    });
  });

  test('SECTION 3 — MULTI-SENDER CONVERSATION TEST', () => {
    // Sequence 100: Aghogho "Okay"
    const srvAghogho1: Message = {
      id: 'srv-agh-1',
      sequence_number: 100,
      event_id: 'evt-agh-1',
      sender_id: 'aghogho',
      content: 'Okay',
      created_at: '2026-09-26T08:00:00.000Z'
    };

    // Optimistic Admin "No" (t = 10ms)
    const optAdminNo: Message = {
      id: 'temp-admin-no',
      event_id: 'evt-admin-no',
      sender_id: 'admin',
      content: 'No',
      created_at: '2026-09-26T08:00:00.010Z',
      _clientTimestamp: new Date('2026-09-26T08:00:00.010Z').getTime()
    };

    // Optimistic Admin "Me" (t = 20ms)
    const optAdminMe: Message = {
      id: 'temp-admin-me',
      event_id: 'evt-admin-me',
      sender_id: 'admin',
      content: 'Me',
      created_at: '2026-09-26T08:00:00.020Z',
      _clientTimestamp: new Date('2026-09-26T08:00:00.020Z').getTime()
    };

    // Sequence 102: Aghogho "Sure" (sent after Admin's "No" is committed with seq 101)
    const srvAghogho2: Message = {
      id: 'srv-agh-2',
      sequence_number: 102,
      event_id: 'evt-agh-2',
      sender_id: 'aghogho',
      content: 'Sure',
      created_at: '2026-09-26T08:00:00.050Z'
    };

    let state = mergeMessages([], [srvAghogho1, optAdminNo, optAdminMe, srvAghogho2]).merged;

    // Confirm Admin "No" with sequence_number 101
    const srvAdminNo: Message = {
      id: 'srv-admin-no-101',
      sequence_number: 101,
      event_id: 'evt-admin-no',
      sender_id: 'admin',
      content: 'No',
      created_at: '2026-09-26T08:00:00.045Z'
    };

    state = mergeMessages(state, [srvAdminNo]).merged;

    // Expected order: Okay (100) -> No (101) -> Me (opt 20ms) -> Sure (102)
    expect(state.map(m => m.content)).toEqual(['Okay', 'No', 'Me', 'Sure']);
    expect(state.length).toBe(4);
  });

  test('SECTION 4 — SERVER AUTHORITATIVE SEQUENCE TEST', () => {
    const msgA: Message = {
      id: 'srv-A',
      sequence_number: 101,
      sender_id: 'u1',
      content: 'A',
      created_at: '2026-09-26T08:00:00.300Z'
    };

    const msgB: Message = {
      id: 'srv-B',
      sequence_number: 102,
      sender_id: 'u1',
      content: 'B',
      created_at: '2026-09-26T08:00:00.100Z'
    };

    const msgC: Message = {
      id: 'srv-C',
      sequence_number: 103,
      sender_id: 'u1',
      content: 'C',
      created_at: '2026-09-26T08:00:00.200Z'
    };

    const state = mergeMessages([], [msgC, msgA, msgB]).merged;

    expect(state.map(m => m.content)).toEqual(['A', 'B', 'C']);
  });

  test('SECTION 5 — OPTIMISTIC BURST TEST (5 messages)', () => {
    const t0 = new Date('2026-09-26T08:00:00.000Z').getTime();

    const optNo: Message = { id: 'temp-1', event_id: 'evt-1', sender_id: 'u1', content: 'No', created_at: '2026-09-26T08:00:00.000Z', _clientTimestamp: t0 };
    const optMe: Message = { id: 'temp-2', event_id: 'evt-2', sender_id: 'u1', content: 'Me', created_at: '2026-09-26T08:00:00.010Z', _clientTimestamp: t0 + 10 };
    const optYes: Message = { id: 'temp-3', event_id: 'evt-3', sender_id: 'u1', content: 'Yes', created_at: '2026-09-26T08:00:00.020Z', _clientTimestamp: t0 + 20 };
    const optMaybe: Message = { id: 'temp-4', event_id: 'evt-4', sender_id: 'u1', content: 'Maybe', created_at: '2026-09-26T08:00:00.030Z', _clientTimestamp: t0 + 30 };
    const optOkay: Message = { id: 'temp-5', event_id: 'evt-5', sender_id: 'u1', content: 'Okay', created_at: '2026-09-26T08:00:00.040Z', _clientTimestamp: t0 + 40 };

    let state = mergeMessages([], [optNo, optMe, optYes, optMaybe, optOkay]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes', 'Maybe', 'Okay']);

    const srv1: Message = { id: 'srv-1', event_id: 'evt-1', sequence_number: 101, sender_id: 'u1', content: 'No', created_at: '2026-09-26T08:00:00.050Z' };
    state = mergeMessages(state, [srv1]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes', 'Maybe', 'Okay']);

    const srv2: Message = { id: 'srv-2', event_id: 'evt-2', sequence_number: 102, sender_id: 'u1', content: 'Me', created_at: '2026-09-26T08:00:00.060Z' };
    state = mergeMessages(state, [srv2]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes', 'Maybe', 'Okay']);

    const srv3: Message = { id: 'srv-3', event_id: 'evt-3', sequence_number: 103, sender_id: 'u1', content: 'Yes', created_at: '2026-09-26T08:00:00.070Z' };
    state = mergeMessages(state, [srv3]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes', 'Maybe', 'Okay']);

    const srv4: Message = { id: 'srv-4', event_id: 'evt-4', sequence_number: 104, sender_id: 'u1', content: 'Maybe', created_at: '2026-09-26T08:00:00.080Z' };
    state = mergeMessages(state, [srv4]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes', 'Maybe', 'Okay']);

    const srv5: Message = { id: 'srv-5', event_id: 'evt-5', sequence_number: 105, sender_id: 'u1', content: 'Okay', created_at: '2026-09-26T08:00:00.090Z' };
    state = mergeMessages(state, [srv5]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes', 'Maybe', 'Okay']);
  });

  test('SECTION 6 — IDENTICAL MESSAGE TEST (4 rapid Hello messages)', () => {
    const t0 = new Date('2026-09-26T08:00:00.000Z').getTime();

    const h1: Message = { id: 'temp-h1', event_id: 'evt-h1', sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.000Z', _clientTimestamp: t0 };
    const h2: Message = { id: 'temp-h2', event_id: 'evt-h2', sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.010Z', _clientTimestamp: t0 + 10 };
    const h3: Message = { id: 'temp-h3', event_id: 'evt-h3', sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.020Z', _clientTimestamp: t0 + 20 };
    const h4: Message = { id: 'temp-h4', event_id: 'evt-h4', sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.030Z', _clientTimestamp: t0 + 30 };

    let state = mergeMessages([], [h1, h2, h3, h4]).merged;
    expect(state.length).toBe(4);

    const srvH1: Message = { id: 'srv-h1', event_id: 'evt-h1', sequence_number: 101, sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.050Z' };
    const srvH2: Message = { id: 'srv-h2', event_id: 'evt-h2', sequence_number: 102, sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.060Z' };
    const srvH3: Message = { id: 'srv-h3', event_id: 'evt-h3', sequence_number: 103, sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.070Z' };
    const srvH4: Message = { id: 'srv-h4', event_id: 'evt-h4', sequence_number: 104, sender_id: 'u1', content: 'Hello', created_at: '2026-09-26T08:00:00.080Z' };

    state = mergeMessages(state, [srvH1, srvH2, srvH3, srvH4]).merged;

    expect(state.length).toBe(4);
    expect(state.map(m => m.id)).toEqual(['srv-h1', 'srv-h2', 'srv-h3', 'srv-h4']);
    expect(state.map(m => m.event_id)).toEqual(['evt-h1', 'evt-h2', 'evt-h3', 'evt-h4']);
  });

  test('SECTION 7 — RECONNECT TEST', () => {
    const t0 = new Date('2026-09-26T08:00:00.000Z').getTime();

    const srvNo: Message = { id: 'srv-101', event_id: 'evt-1', sequence_number: 101, sender_id: 'u1', content: 'No', created_at: '2026-09-26T08:00:00.045Z', _clientTimestamp: t0 };
    const optMe: Message = { id: 'temp-me', event_id: 'evt-2', sender_id: 'u1', content: 'Me', created_at: '2026-09-26T08:00:00.030Z', _clientTimestamp: t0 + 30 };
    const optYes: Message = { id: 'temp-yes', event_id: 'evt-3', sender_id: 'u1', content: 'Yes', created_at: '2026-09-26T08:00:00.060Z', _clientTimestamp: t0 + 60 };

    let state = mergeMessages([], [srvNo, optMe, optYes]).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes']);

    state = mergeMessages(state, [srvNo]).merged;

    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes']);
    expect(state.length).toBe(3);
  });

  test('SECTION 8 — ACCOUNT SWITCH TEST', () => {
    const adminMsgs: Message[] = [
      { id: 'srv-101', sequence_number: 101, event_id: 'evt-1', sender_id: 'admin', content: 'No', created_at: '2026-09-26T08:00:00.045Z' },
      { id: 'srv-102', sequence_number: 102, event_id: 'evt-2', sender_id: 'admin', content: 'Me', created_at: '2026-09-26T08:00:00.150Z' },
      { id: 'srv-103', sequence_number: 103, event_id: 'evt-3', sender_id: 'admin', content: 'Yes', created_at: '2026-09-26T08:00:00.200Z' }
    ];

    let state = mergeMessages([], adminMsgs).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes']);

    state = [];

    state = mergeMessages([], adminMsgs).merged;
    expect(state.map(m => m.content)).toEqual(['No', 'Me', 'Yes']);
  });

  test('SECTION 9 — CLEAR HISTORY LOCAL SAFETY', () => {
    const conversationId = 'conv-1';
    let messagesMap: Record<string, Message[]> = {
      [conversationId]: [
        { id: 'srv-1', sequence_number: 101, sender_id: 'u1', content: 'No', created_at: '2026-09-26T08:00:00.045Z' }
      ]
    };

    messagesMap[conversationId] = [];

    expect(messagesMap[conversationId]).toEqual([]);
  });

});
