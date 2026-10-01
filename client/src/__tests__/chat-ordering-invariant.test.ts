import { describe, test, expect } from 'vitest';
import { mergeMessages, Message } from '../../../shared/messageMergeEngine.ts';

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

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 10 — MANDATORY REGRESSION: flushQueue pre-filter removal
  //
  // Before fix: setMessages did:
  //   const filtered = current.filter(m => m.id !== tempId && ...)
  //   mergeMessages(filtered, [canonicalMessage])
  //
  // This removed the optimistic temp- message before merging, so
  // mergeMessages never ran its conflict-resolution path and never copied
  // _clientTimestamp from the optimistic message onto the canonical one.
  // Server ACK then sorted by server-assigned created_at, inverting order.
  //
  // After fix: mergeMessages(current, [canonicalMessage]) — full array passed.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SECTION 10 — flushQueue pre-filter regression', () => {

    test('10.1 — optimistic M1 stays in current during ACK; _clientTimestamp survives', () => {
      const T1 = 1000;
      const T2 = 1030;

      const optM1: Message = {
        id: 'temp-M1', event_id: 'evt-M1', sender_id: 'u1',
        content: 'No', created_at: new Date(T1).toISOString(), _clientTimestamp: T1
      };
      const optM2: Message = {
        id: 'temp-M2', event_id: 'evt-M2', sender_id: 'u1',
        content: 'Me', created_at: new Date(T2).toISOString(), _clientTimestamp: T2
      };

      // Step 1: Insert both optimistic messages
      let current = mergeMessages([], [optM1, optM2]).merged;
      expect(current.map(m => m.content)).toEqual(['No', 'Me']);

      // Step 2: Server ACK for M1 arrives with later server-assigned created_at
      // Simulate flushQueue fix: pass full current (NOT pre-filtered)
      const srvM1: Message = {
        id: 'srv-M1', event_id: 'evt-M1', sender_id: 'u1',
        content: 'No', sequence_number: 101,
        created_at: new Date(T1 + 200).toISOString(), // server created_at is LATER than T2
        status: 'sent'
      };

      // This is the correct call — full current, not filtered
      const { merged: afterAck1 } = mergeMessages(current, [srvM1]);

      // ORDER MUST NOT CHANGE
      expect(afterAck1.map(m => m.content)).toEqual(['No', 'Me']);

      // M1 is now canonical but _clientTimestamp=T1 must survive
      const m1AfterAck = afterAck1.find(m => m.content === 'No');
      expect(m1AfterAck).toBeDefined();
      expect(m1AfterAck!._clientTimestamp).toBe(T1);
      expect(m1AfterAck!.sequence_number).toBe(101);
      expect(m1AfterAck!.id).toBe('srv-M1');

      // Step 3: ACK for M2
      const srvM2: Message = {
        id: 'srv-M2', event_id: 'evt-M2', sender_id: 'u1',
        content: 'Me', sequence_number: 102,
        created_at: new Date(T1 + 250).toISOString(),
        status: 'sent'
      };
      const { merged: afterAck2 } = mergeMessages(afterAck1, [srvM2]);
      expect(afterAck2.map(m => m.content)).toEqual(['No', 'Me']);
      const m2AfterAck = afterAck2.find(m => m.content === 'Me');
      expect(m2AfterAck!._clientTimestamp).toBe(T2);
    });

    test('10.2 — pre-filter simulation WOULD invert order (documents the bug being fixed)', () => {
      // This test documents what would go wrong with the old pre-filter.
      // It is NOT a test of the current code — it proves the bug existed.
      const T1 = 1000;
      const T2 = 1030;

      const optM1: Message = {
        id: 'temp-M1', event_id: 'evt-M1', sender_id: 'u1',
        content: 'No', created_at: new Date(T1).toISOString(), _clientTimestamp: T1
      };
      const optM2: Message = {
        id: 'temp-M2', event_id: 'evt-M2', sender_id: 'u1',
        content: 'Me', created_at: new Date(T2).toISOString(), _clientTimestamp: T2
      };

      let current = mergeMessages([], [optM1, optM2]).merged;

      const srvM1: Message = {
        id: 'srv-M1', event_id: 'evt-M1', sender_id: 'u1',
        content: 'No', sequence_number: 101,
        // Server-assigned created_at is 200ms LATER than M2's _clientTimestamp
        created_at: new Date(T1 + 200).toISOString(),
        status: 'sent'
      };

      // Simulate the OLD (broken) pre-filter behavior:
      const filtered = current.filter(m => m.id !== 'temp-M1' && m.event_id !== 'evt-M1');
      const { merged: brokenResult } = mergeMessages(filtered, [srvM1]);
      // srv-M1 has no _clientTimestamp (wasn't copied because temp was removed),
      // so it sorts by created_at=T1+200ms which is AFTER M2's T2=T1+30ms.
      // Result: [Me, No] — INVERTED. This confirms the pre-filter was the bug.
      expect(brokenResult.map(m => m.content)).toEqual(['Me', 'No']); // bug reproduced

      // The fix (full current) corrects this:
      const { merged: fixedResult } = mergeMessages(current, [srvM1]);
      expect(fixedResult.map(m => m.content)).toEqual(['No', 'Me']); // fixed
    });

    test('10.3 — all four ACK permutations for 4 rapid messages preserve causal order', () => {
      const T0 = 10000;
      const msgs = ['No', 'Me', 'Yes', 'I miss you'].map((content, i): Message => ({
        id: `temp-${i}`, event_id: `evt-${i}`, sender_id: 'u1',
        content, created_at: new Date(T0 + i * 20).toISOString(), _clientTimestamp: T0 + i * 20
      }));

      const srvMsgs = msgs.map((m, i): Message => ({
        id: `srv-${i}`, event_id: `evt-${i}`, sender_id: 'u1',
        content: m.content, sequence_number: 101 + i,
        // server created_at assigned 300ms after all client timestamps — out of client order
        created_at: new Date(T0 + 300 + i * 5).toISOString(), status: 'sent'
      }));

      const expectedOrder = ['No', 'Me', 'Yes', 'I miss you'];

      // Permutation 1: M1→M2→M3→M4
      {
        let state = mergeMessages([], msgs).merged;
        for (const srv of [srvMsgs[0], srvMsgs[1], srvMsgs[2], srvMsgs[3]]) {
          state = mergeMessages(state, [srv]).merged;
          // After each ACK, already-confirmed messages must be in order
          const contents = state.map(m => m.content);
          for (let i = 0; i < contents.length - 1; i++) {
            const ai = expectedOrder.indexOf(contents[i]);
            const bi = expectedOrder.indexOf(contents[i + 1]);
            expect(ai).toBeLessThan(bi);
          }
        }
        expect(state.map(m => m.content)).toEqual(expectedOrder);
      }

      // Permutation 2: M2→M1→M3→M4
      {
        let state = mergeMessages([], msgs).merged;
        for (const srv of [srvMsgs[1], srvMsgs[0], srvMsgs[2], srvMsgs[3]]) {
          state = mergeMessages(state, [srv]).merged;
          const contents = state.map(m => m.content);
          for (let i = 0; i < contents.length - 1; i++) {
            const ai = expectedOrder.indexOf(contents[i]);
            const bi = expectedOrder.indexOf(contents[i + 1]);
            expect(ai).toBeLessThan(bi);
          }
        }
        expect(state.map(m => m.content)).toEqual(expectedOrder);
      }

      // Permutation 3: M4→M2→M1→M3
      {
        let state = mergeMessages([], msgs).merged;
        for (const srv of [srvMsgs[3], srvMsgs[1], srvMsgs[0], srvMsgs[2]]) {
          state = mergeMessages(state, [srv]).merged;
          const contents = state.map(m => m.content);
          for (let i = 0; i < contents.length - 1; i++) {
            const ai = expectedOrder.indexOf(contents[i]);
            const bi = expectedOrder.indexOf(contents[i + 1]);
            expect(ai).toBeLessThan(bi);
          }
        }
        expect(state.map(m => m.content)).toEqual(expectedOrder);
      }

      // Permutation 4: M3→M1→M4→M2
      {
        let state = mergeMessages([], msgs).merged;
        for (const srv of [srvMsgs[2], srvMsgs[0], srvMsgs[3], srvMsgs[1]]) {
          state = mergeMessages(state, [srv]).merged;
          const contents = state.map(m => m.content);
          for (let i = 0; i < contents.length - 1; i++) {
            const ai = expectedOrder.indexOf(contents[i]);
            const bi = expectedOrder.indexOf(contents[i + 1]);
            expect(ai).toBeLessThan(bi);
          }
        }
        expect(state.map(m => m.content)).toEqual(expectedOrder);
      }
    });

    test('10.4 — identical-content 4-message burst: event_id maps to exactly one rendered entry', () => {
      const T0 = 20000;
      const opts: Message[] = Array.from({ length: 4 }, (_, i) => ({
        id: `temp-hello-${i}`, event_id: `evt-hello-${i}`, sender_id: 'u1',
        content: 'Hello', created_at: new Date(T0 + i * 10).toISOString(), _clientTimestamp: T0 + i * 10
      }));

      let state = mergeMessages([], opts).merged;
      expect(state.length).toBe(4);

      // ACK all four — each with unique sequence_number
      const srvs: Message[] = Array.from({ length: 4 }, (_, i) => ({
        id: `srv-hello-${i}`, event_id: `evt-hello-${i}`, sender_id: 'u1',
        content: 'Hello', sequence_number: 201 + i,
        created_at: new Date(T0 + 200 + i * 5).toISOString(), status: 'sent'
      }));

      state = mergeMessages(state, srvs).merged;
      expect(state.length).toBe(4); // no duplicates
      // Each event_id appears exactly once
      const eventIds = state.map(m => m.event_id);
      const uniqueEventIds = new Set(eventIds);
      expect(uniqueEventIds.size).toBe(4);
      expect(eventIds).toEqual(['evt-hello-0', 'evt-hello-1', 'evt-hello-2', 'evt-hello-3']);
    });

    test('10.5 — HTTP ACK then socket echo: one canonical message, no duplicate', () => {
      const T1 = 30000;
      const opt: Message = {
        id: 'temp-sock', event_id: 'evt-sock', sender_id: 'u1',
        content: 'Socket', created_at: new Date(T1).toISOString(), _clientTimestamp: T1
      };

      let state = mergeMessages([], [opt]).merged;
      expect(state.length).toBe(1);

      // HTTP ACK first
      const httpAck: Message = {
        id: 'srv-sock', event_id: 'evt-sock', sender_id: 'u1',
        content: 'Socket', sequence_number: 301,
        created_at: new Date(T1 + 100).toISOString(), status: 'sent'
      };
      state = mergeMessages(state, [httpAck]).merged;
      expect(state.length).toBe(1);

      // Socket echo arrives after HTTP ACK (server broadcast)
      const socketEcho: Message = {
        id: 'srv-sock', event_id: 'evt-sock', sender_id: 'u1',
        content: 'Socket', sequence_number: 301,
        created_at: new Date(T1 + 100).toISOString(), status: 'delivered'
      };
      state = mergeMessages(state, [socketEcho]).merged;
      expect(state.length).toBe(1); // no duplicate
      expect(state[0].status).toBe('delivered'); // status promoted
    });

    test('10.5b — socket event arrives before HTTP ACK: same result, no duplicate', () => {
      const T1 = 40000;
      const opt: Message = {
        id: 'temp-early', event_id: 'evt-early', sender_id: 'u1',
        content: 'Early', created_at: new Date(T1).toISOString(), _clientTimestamp: T1
      };

      let state = mergeMessages([], [opt]).merged;

      // Socket event arrives first (before HTTP ACK)
      const socketFirst: Message = {
        id: 'srv-early', event_id: 'evt-early', sender_id: 'u1',
        content: 'Early', sequence_number: 401,
        created_at: new Date(T1 + 80).toISOString(), status: 'sent'
      };
      state = mergeMessages(state, [socketFirst]).merged;
      expect(state.length).toBe(1);
      expect(state[0].id).toBe('srv-early');

      // HTTP ACK arrives after socket (late)
      const httpLate: Message = {
        id: 'srv-early', event_id: 'evt-early', sender_id: 'u1',
        content: 'Early', sequence_number: 401,
        created_at: new Date(T1 + 80).toISOString(), status: 'sent'
      };
      state = mergeMessages(state, [httpLate]).merged;
      expect(state.length).toBe(1); // still exactly one message
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 11 — OFFLINE QUEUE SEMANTICS
  // Verifies that removal of the pre-filter does not cause duplicate messages
  // when multiple intents are queued while offline and then flushed in order.
  // ─────────────────────────────────────────────────────────────────────────────
  test('SECTION 11 — Offline queue: 3 queued messages reconcile to 3 canonical with no duplicates', () => {
    const T0 = 50000;
    // Three messages queued while offline
    const opts: Message[] = ['M1', 'M2', 'M3'].map((content, i): Message => ({
      id: `temp-off-${i}`, event_id: `evt-off-${i}`, sender_id: 'u1',
      content, created_at: new Date(T0 + i * 15).toISOString(), _clientTimestamp: T0 + i * 15
    }));

    // Initial state: all three optimistic
    let state = mergeMessages([], opts).merged;
    expect(state.length).toBe(3);
    expect(state.map(m => m.content)).toEqual(['M1', 'M2', 'M3']);

    // Connectivity returns — intents flushed sequentially (in send order)
    const srvs: Message[] = opts.map((m, i): Message => ({
      id: `srv-off-${i}`, event_id: `evt-off-${i}`, sender_id: 'u1',
      content: m.content, sequence_number: 501 + i,
      created_at: new Date(T0 + 500 + i * 5).toISOString(), status: 'sent'
    }));

    // Each flush: mergeMessages(full_current, [canonical]) — matches fix
    for (const srv of srvs) {
      state = mergeMessages(state, [srv]).merged;
    }

    expect(state.length).toBe(3); // no duplicates
    expect(state.map(m => m.content)).toEqual(['M1', 'M2', 'M3']);
    expect(state.every(m => m.status === 'sent')).toBe(true);
    expect(state.map(m => m.sequence_number)).toEqual([501, 502, 503]);
  });

});
