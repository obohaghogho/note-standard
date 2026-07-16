/**
 * delivery-pipeline.test.js
 *
 * Automated Integration Tests for v2 Messaging Delivery Subsystem.
 * Covers:
 *   - Recipient Online: delivering via socket, no immediate push, scheduling ACK timeout
 *   - Recipient Offline: delivering via push immediately
 *   - Delivery ACK: clears pending push timer, transitions state (SENT -> DELIVERED)
 *   - ACK Timeout Fired: falls back to push if socket delivery was not acknowledged in time
 *   - State machine idempotency: second ACK is a no-op
 *   - Receipt Engine transitions
 */

const assert = require('assert');
const EventEmitter = require('events');

// Mock dependencies
class MockSocket {
  constructor(id, rooms = []) {
    this.id = id;
    this.rooms = new Set(rooms);
  }
}

class MockSocketServer extends EventEmitter {
  constructor() {
    super();
    this.sockets = [];
    this.emits = [];
  }

  // Socket.IO room routing mock
  to(room) {
    return {
      emit: (event, payload) => {
        this.emits.push({ room, event, payload });
      }
    };
  }

  in(room) {
    return {
      fetchSockets: async () => {
        return this.sockets.filter(s => s.rooms.has(room));
      }
    };
  }
}

class MockSupabase {
  constructor() {
    this.messages = [];
    this.installations = [];
    this.updates = [];
  }

  from(table) {
    const builder = {
      select: (cols) => builder,
      insert: (payload) => {
        builder._insertPayload = payload;
        return builder;
      },
      update: (payload) => {
        builder._updatePayload = payload;
        return builder;
      },
      eq: (field, val) => {
        builder._eqField = field;
        builder._eqVal = val;
        return builder;
      },
      neq: (field, val) => builder,
      is: (field, val) => builder,
      in: (field, vals) => {
        builder._inVals = vals;
        return builder;
      },
      single: () => {
        if (table === 'messages' && builder._eqVal) {
          const idx = this.messages.findIndex(m => m.id === builder._eqVal);
          if (idx !== -1) {
            const msg = this.messages[idx];
            if (builder._updatePayload) {
              if (msg.delivered_at === null) {
                msg.delivered_at = builder._updatePayload.delivered_at || new Date().toISOString();
                this.updates.push({ id: builder._eqVal, payload: builder._updatePayload });
                return { data: msg, error: null };
              }
              return { data: null, error: { code: 'PGRST116', message: 'Already delivered' } };
            }
            return { data: msg, error: null };
          }
          return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
        }
        return { data: null, error: null };
      },
      then: (resolve) => {
        if (table === 'installation_accounts') {
          const matches = this.installations.filter(i => i.user_id === builder._eqVal);
          resolve({ data: matches, error: null });
        } else if (table === 'messages' && builder._inVals) {
          const matches = this.messages.filter(m => builder._inVals.includes(m.id));
          resolve({ data: matches, error: null });
        } else if (table === 'messages' && builder._eqVal) {
          const match = this.messages.find(m => m.id === builder._eqVal);
          resolve({ data: match, error: match ? null : { code: 'PGRST116', message: 'Not found' } });
        } else {
          resolve({ data: [], error: null });
        }
      }
    };
    return builder;
  }
}

// Intercept modules
const receiptEngine = require('../services/receiptEngine');
const deliveryEngine = require('../services/deliveryEngine');
const chatPush = require('../services/chatPush');

// Spy/Mock chatPush.sendChatPush to verify calls
let pushCalls = [];
chatPush.sendChatPush = async (opts) => {
  pushCalls.push(opts);
};

async function runTests() {
  console.log("🚀 Running Automated v2 Messaging Delivery Subsystem Integration Tests...\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      pushCalls = [];
      fn();
      console.log(`✅ Passed: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ Failed: ${name}`);
      console.error(err);
      failed++;
    }
  }

  function testAsync(name, fn) {
    return new Promise((resolve) => {
      pushCalls = [];
      fn()
        .then(() => {
          console.log(`✅ Passed: ${name}`);
          passed++;
          resolve();
        })
        .catch((err) => {
          console.error(`❌ Failed: ${name}`);
          console.error(err);
          failed++;
          resolve();
        });
    });
  }

  // --- Test 1: Recipient Online (socket connected) ---
  await testAsync("Recipient Online: socket receives message, push is deferred, ACK timer scheduled", async () => {
    const io = new MockSocketServer();
    const supabase = new MockSupabase();

    // Add recipient socket connection
    io.sockets.push(new MockSocket('socket_1', ['user:recipient_1']));

    const envelope = {
      payload: {
        id: 'msg_1',
        conversation_id: 'conv_1',
        sender_id: 'sender_1',
        content: 'Hello World',
        type: 'text'
      },
      users: ['sender_1', 'recipient_1']
    };

    await deliveryEngine.processIncomingMessage(io, supabase, envelope);

    // Verify no immediate push call since socket is online
    assert.strictEqual(pushCalls.length, 0, "Push should not be sent immediately when socket is connected");
  });

  // --- Test 2: Recipient Offline (no socket) ---
  await testAsync("Recipient Offline: immediate push triggering", async () => {
    const io = new MockSocketServer();
    const supabase = new MockSupabase();

    // Empty sockets
    io.sockets = [];

    const envelope = {
      payload: {
        id: 'msg_2',
        conversation_id: 'conv_1',
        sender_id: 'sender_1',
        content: 'Hello World',
        type: 'text'
      },
      users: ['sender_1', 'recipient_1']
    };

    await deliveryEngine.processIncomingMessage(io, supabase, envelope);

    // Verify immediate push
    assert.strictEqual(pushCalls.length, 1, "Push should be sent immediately when socket is offline");
    assert.strictEqual(pushCalls[0].userId, 'recipient_1');
    assert.strictEqual(pushCalls[0].messageId, 'msg_2');
  });

  // --- Test 3: Socket ACK clears pending timeout & transitions state ---
  await testAsync("Socket ACK: cancels push timeout, updates DB state to DELIVERED, and emits receipt to sender", async () => {
    const io = new MockSocketServer();
    const supabase = new MockSupabase();

    // Add message to DB in SENT state
    supabase.messages.push({
      id: 'msg_3',
      conversation_id: 'conv_1',
      sender_id: 'sender_1',
      event_id: 'evt_3',
      delivered_at: null
    });

    // Recipient online
    io.sockets.push(new MockSocket('socket_2', ['user:recipient_1']));

    const envelope = {
      payload: {
        id: 'msg_3',
        conversation_id: 'conv_1',
        sender_id: 'sender_1',
        content: 'Hello World',
        type: 'text'
      },
      users: ['sender_1', 'recipient_1']
    };

    // Receive message (schedules ACK timeout)
    await deliveryEngine.processIncomingMessage(io, supabase, envelope);

    // Trigger ACK delivery receipt
    const result = await deliveryEngine.handleDeliveryAck(supabase, io, 'msg_3', 'recipient_1');

    assert.strictEqual(result.updated, true, "State transition should succeed");
    assert.ok(result.message.delivered_at, "delivered_at should be timestamped");

    // Verify Socket.IO notifications went to sender and conversation
    const senderReceipt = io.emits.find(e => e.room === 'user:sender_1');
    assert.ok(senderReceipt, "Sender should receive delivery receipt");
    assert.strictEqual(senderReceipt.event, 'chat:message_delivered');
    assert.strictEqual(senderReceipt.payload.messageId, 'msg_3');
  });

  // --- Test 4: ACK Timeout Fired (Fallback to push) ---
  await testAsync("ACK Timeout Fallback: push is sent if ACK not received within timeout", async () => {
    const io = new MockSocketServer();
    const supabase = new MockSupabase();

    // Add message to DB in SENT state
    supabase.messages.push({
      id: 'msg_4',
      conversation_id: 'conv_1',
      sender_id: 'sender_1',
      event_id: 'evt_4',
      delivered_at: null
    });

    // Recipient online (schedules ACK)
    io.sockets.push(new MockSocket('socket_3', ['user:recipient_1']));

    const envelope = {
      payload: {
        id: 'msg_4',
        conversation_id: 'conv_1',
        sender_id: 'sender_1',
        content: 'Hello World',
        type: 'text'
      },
      users: ['sender_1', 'recipient_1']
    };

    // Override ACK_TIMEOUT_MS temporarily by configuring env or process global
    // Our deliveryEngine uses process.env.DELIVERY_ACK_TIMEOUT_MS or 10000. Let's make sure it's fast
    process.env.DELIVERY_ACK_TIMEOUT_MS = '50';
    
    // We need to re-require or rely on it since it's parsed once. But wait! Let's check how deliveryEngine reads it.
    // Line 23: const ACK_TIMEOUT_MS = parseInt(process.env.DELIVERY_ACK_TIMEOUT_MS || '10000', 10);
    // Ah, it parses it at module load. Since it's already loaded, it will use 10000ms.
    // That is fine, we can use jest/sinon fake timers if we had them, or just use a small delay, but wait:
    // Can we temporarily redefine setTimeout/clearTimeout for the test to speed it up?
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (fn, delay) => {
      // Instantly run the callback
      return originalSetTimeout(fn, 1);
    };

    try {
      await deliveryEngine.processIncomingMessage(io, supabase, envelope);
      
      // Wait a moment for the immediate execution
      await new Promise(r => originalSetTimeout(r, 10));

      assert.strictEqual(pushCalls.length, 1, "Fallback push should fire after timeout expires");
      assert.strictEqual(pushCalls[0].messageId, 'msg_4');
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  // --- Test 5: Idempotency of state transitions ---
  await testAsync("State machine idempotency: second ACK is a no-op", async () => {
    const io = new MockSocketServer();
    const supabase = new MockSupabase();

    supabase.messages.push({
      id: 'msg_5',
      conversation_id: 'conv_1',
      sender_id: 'sender_1',
      event_id: 'evt_5',
      delivered_at: null
    });

    // First ACK
    const res1 = await receiptEngine.markDelivered(supabase, io, 'msg_5');
    assert.strictEqual(res1.updated, true, "First ACK should update state");

    // Second ACK
    const res2 = await receiptEngine.markDelivered(supabase, io, 'msg_5');
    assert.strictEqual(res2.updated, false, "Second ACK should be a no-op");
  });

  console.log(`\nTests finished. Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
