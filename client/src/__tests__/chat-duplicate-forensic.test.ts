import { describe, test, expect } from 'vitest';
import { mergeMessages, Message } from '../../../shared/messageMergeEngine';
import { OfflineQueueEngine } from '../../../shared/offlineQueueEngine';

describe('Chat Duplicate Forensic Investigation', () => {
  test('Case 1: Single flight queue swallows rapid message flush (PROVEN)', async () => {
    const queue = new OfflineQueueEngine();
    const flushedIntents: string[] = [];

    const runFlush = () => queue.runSingleFlight(async () => {
      const pending = await queue.getPendingIntents();
      if (pending.length === 0) return;
      for (const intent of pending) {
        await new Promise(r => setTimeout(r, 50));
        flushedIntents.push(intent.event_id);
        await queue.removeIntent(intent.event_id);
      }
    });

    await queue.pushIntent({ event_id: 'evt-Hi', client_message_id: 'temp-Hi', conversation_id: 'c1', payload: { content: 'Hi' }, created_at: Date.now() });
    const p1 = runFlush();

    await new Promise(r => setTimeout(r, 10));
    await queue.pushIntent({ event_id: 'evt-Me', client_message_id: 'temp-Me', conversation_id: 'c1', payload: { content: 'Me' }, created_at: Date.now() });
    const p2 = runFlush();

    await new Promise(r => setTimeout(r, 10));
    await queue.pushIntent({ event_id: 'evt-You', client_message_id: 'temp-You', conversation_id: 'c1', payload: { content: 'You' }, created_at: Date.now() });
    const p3 = runFlush();

    await p1;

    expect(flushedIntents).toEqual(['evt-Hi']);
    const remaining = await queue.getPendingIntents();
    expect(remaining.map(r => r.event_id)).toEqual(['evt-Me', 'evt-You']);
  });

  test('Case 1 Fix: Loop in flushQueue drains all rapidly queued intents', async () => {
    const queue = new OfflineQueueEngine();
    const flushedIntents: string[] = [];

    const runFlushWithLoop = () => queue.runSingleFlight(async () => {
      while (true) {
        const pending = await queue.getPendingIntents();
        if (pending.length === 0) break;
        for (const intent of pending) {
          await new Promise(r => setTimeout(r, 50));
          flushedIntents.push(intent.event_id);
          await queue.removeIntent(intent.event_id);
        }
      }
    });

    await queue.pushIntent({ event_id: 'evt-Hi', client_message_id: 'temp-Hi', conversation_id: 'c1', payload: { content: 'Hi' }, created_at: Date.now() });
    const p1 = runFlushWithLoop();

    await new Promise(r => setTimeout(r, 10));
    await queue.pushIntent({ event_id: 'evt-Me', client_message_id: 'temp-Me', conversation_id: 'c1', payload: { content: 'Me' }, created_at: Date.now() });
    runFlushWithLoop();

    await new Promise(r => setTimeout(r, 10));
    await queue.pushIntent({ event_id: 'evt-You', client_message_id: 'temp-You', conversation_id: 'c1', payload: { content: 'You' }, created_at: Date.now() });
    runFlushWithLoop();

    await p1;

    expect(flushedIntents).toEqual(['evt-Hi', 'evt-Me', 'evt-You']);
    const remaining = await queue.getPendingIntents();
    expect(remaining).toHaveLength(0);
  });

  test('Case C: Check if messageMergeEngine maintains chronological order for mixed optimistic/server messages', () => {
    const current: Message[] = [
      { id: 'temp-101', event_id: 'evt-101', conversation_id: 'c1', sender_id: 'u1', content: 'Hi', created_at: '2026-09-26T07:00:00.000Z', status: 'sending' },
      { id: 'temp-102', event_id: 'evt-102', conversation_id: 'c1', sender_id: 'u1', content: 'Me', created_at: '2026-09-26T07:00:00.100Z', status: 'sending' },
      { id: 'temp-103', event_id: 'evt-103', conversation_id: 'c1', sender_id: 'u1', content: 'You', created_at: '2026-09-26T07:00:00.200Z', status: 'sending' },
    ];

    const incomingServerMsg: Message = {
      id: 'srv-102',
      event_id: 'evt-102',
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Me',
      sequence_number: 2,
      created_at: '2026-09-26T07:00:00.100Z',
      status: 'sent'
    };

    const { merged } = mergeMessages(current, [incomingServerMsg]);

    expect(merged).toHaveLength(3);
    expect(merged.map(m => m.id)).toEqual(['temp-101', 'srv-102', 'temp-103']);
  });

  test('Case D: Same server message received via both HTTP ACK and Socket event', () => {
    let current: Message[] = [
      { id: 'temp-102', event_id: 'evt-102', conversation_id: 'c1', sender_id: 'u1', content: 'Me', created_at: '2026-09-26T07:00:00.100Z', status: 'sending' }
    ];

    const srvMsg: Message = {
      id: 'srv-102',
      event_id: 'evt-102',
      conversation_id: 'c1',
      sender_id: 'u1',
      content: 'Me',
      sequence_number: 2,
      created_at: '2026-09-26T07:00:00.150Z',
      status: 'sent'
    };

    const res1 = mergeMessages(current, [srvMsg]);
    current = res1.merged;

    const res2 = mergeMessages(current, [srvMsg]);
    current = res2.merged;

    expect(current).toHaveLength(1);
    expect(current[0].id).toBe('srv-102');
  });

  test('Case E: Four identical messages ("Hello", "Hello", "Hello", "Hello") remain 4 distinct messages', () => {
    const msgs: Message[] = [
      { id: 'srv-1', event_id: 'evt-1', conversation_id: 'c1', sender_id: 'u1', content: 'Hello', sequence_number: 1, created_at: '2026-09-26T07:00:00.000Z' },
      { id: 'srv-2', event_id: 'evt-2', conversation_id: 'c1', sender_id: 'u1', content: 'Hello', sequence_number: 2, created_at: '2026-09-26T07:00:00.100Z' },
      { id: 'srv-3', event_id: 'evt-3', conversation_id: 'c1', sender_id: 'u1', content: 'Hello', sequence_number: 3, created_at: '2026-09-26T07:00:00.200Z' },
      { id: 'srv-4', event_id: 'evt-4', conversation_id: 'c1', sender_id: 'u1', content: 'Hello', sequence_number: 4, created_at: '2026-09-26T07:00:00.300Z' },
    ];

    const { merged } = mergeMessages([], msgs);
    expect(merged).toHaveLength(4);
    expect(merged.map(m => m.id)).toEqual(['srv-1', 'srv-2', 'srv-3', 'srv-4']);
  });
});
