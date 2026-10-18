const assert = require('assert');
const path = require('path');

// Unref background interval timers (e.g. diagnosticLogger, replayGuard) so test process drains naturally
const _origSetInterval = global.setInterval;
global.setInterval = function(...args) {
  const timer = _origSetInterval.apply(this, args);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
};

// ── In-Memory Isolated Database Store ──────────────────────────────────────────
class MockDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.profiles = new Map();
    this.community_follows = [];
    this.user_blocks = [];
    this.conversations = new Map();
    this.conversation_members = [];
    this.messages = [];
    this.notifications = [];
    this.pushEvents = [];
    this.realtimeEvents = [];
    this.tableErrors = new Map();
    this.failMemberInsertForUser = null;
  }
}

const db = new MockDatabase();

// ── Mock Supabase Query Builder ──────────────────────────────────────────────
class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orFilters = [];
    this.selectedColumns = '*';
    this.orderClause = null;
    this.limitCount = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.updateValues = null;
    this.insertValues = null;
    this.isDelete = false;
  }

  select(cols = '*') {
    this.selectedColumns = cols;
    return this;
  }

  insert(values) {
    this.insertValues = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values) {
    this.updateValues = values;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  eq(col, val) {
    this.filters.push({ col, op: 'eq', val });
    return this;
  }

  neq(col, val) {
    this.filters.push({ col, op: 'neq', val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ col, op: 'in', val: vals });
    return this;
  }

  ilike(col, val) {
    this.filters.push({ col, op: 'ilike', val });
    return this;
  }

  or(filterStr) {
    this.orFilters.push(filterStr);
    return this;
  }

  order(col, opts = {}) {
    this.orderClause = { col, ascending: opts.ascending !== false };
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  _matchesFilters(row) {
    for (const f of this.filters) {
      if (f.op === 'eq' && row[f.col] !== f.val) return false;
      if (f.op === 'neq' && row[f.col] === f.val) return false;
      if (f.op === 'in' && (!Array.isArray(f.val) || !f.val.includes(row[f.col]))) return false;
      if (f.op === 'ilike') {
        const rowVal = String(row[f.col] || '').toLowerCase();
        const targetVal = String(f.val || '').toLowerCase();
        if (rowVal !== targetVal) return false;
      }
    }

    for (const orStr of this.orFilters) {
      // Supports "and(blocker_id.eq.A,blocked_id.eq.B),and(blocker_id.eq.B,blocked_id.eq.A)"
      // and "blocker_id.eq.A,blocked_id.eq.A"
      const clauses = orStr.split(',').map(s => s.trim());
      let matchedAny = false;

      if (orStr.includes('and(')) {
        // Compound and(...) clauses: e.g. and(blocker_id.eq.X,blocked_id.eq.Y)
        const andBlocks = orStr.match(/and\([^)]+\)/g) || [];
        for (const andBlock of andBlocks) {
          const inner = andBlock.replace(/^and\(/, '').replace(/\)$/, '');
          const innerPairs = inner.split(',').map(p => p.trim());
          let andMatched = true;
          for (const pair of innerPairs) {
            const [c, op, v] = pair.split('.');
            if (op === 'eq' && row[c] !== v) {
              andMatched = false;
              break;
            }
          }
          if (andMatched) {
            matchedAny = true;
            break;
          }
        }
      } else {
        for (const clause of clauses) {
          const [c, op, v] = clause.split('.');
          if (op === 'eq' && row[c] === v) {
            matchedAny = true;
            break;
          }
          if (op === 'is' && v === 'null' && row[c] == null) {
            matchedAny = true;
            break;
          }
          if (op === 'neq' && row[c] !== v) {
            matchedAny = true;
            break;
          }
        }
      }

      if (!matchedAny) return false;
    }

    return true;
  }

  async then(resolve) {
    if (db.tableErrors && db.tableErrors.has(this.table)) {
      const err = db.tableErrors.get(this.table);
      return resolve({ data: null, error: err });
    }

    let rows = [];

    if (this.table === 'profiles') {
      rows = Array.from(db.profiles.values());
    } else if (this.table === 'community_follows') {
      rows = db.community_follows;
    } else if (this.table === 'user_blocks') {
      rows = db.user_blocks;
    } else if (this.table === 'conversations') {
      rows = Array.from(db.conversations.values());
    } else if (this.table === 'conversation_members') {
      rows = db.conversation_members;
    } else if (this.table === 'messages') {
      rows = db.messages;
    }

    // Handle INSERT
    if (this.insertValues) {
      if (this.table === 'conversation_members' && db.failMemberInsertForUser) {
        const hasFailedUser = this.insertValues.some(v => v.user_id === db.failMemberInsertForUser);
        if (hasFailedUser) {
          return resolve({ data: null, error: { message: `Simulated member insert failure for ${db.failMemberInsertForUser}`, code: '23503' } });
        }
      }
      const inserted = [];
      for (const val of this.insertValues) {
        const newRow = { ...val };
        if (!newRow.id) {
          newRow.id = `${this.table.slice(0, 4)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        }
        if (this.table === 'conversations') {
          db.conversations.set(newRow.id, newRow);
        } else if (this.table === 'conversation_members') {
          db.conversation_members.push(newRow);
        } else if (this.table === 'messages') {
          newRow.created_at = newRow.created_at || new Date().toISOString();
          db.messages.push(newRow);
        }
        inserted.push(newRow);
      }
      const res = this.isSingle ? { data: inserted[0] || null, error: null } : { data: inserted, error: null };
      return resolve(res);
    }

    // Handle UPDATE
    if (this.updateValues) {
      const matched = rows.filter(r => this._matchesFilters(r));
      matched.forEach(r => {
        Object.assign(r, this.updateValues);
      });
      const res = this.isSingle ? { data: matched[0] || null, error: null } : { data: matched, error: null };
      return resolve(res);
    }

    // Handle DELETE
    if (this.isDelete) {
      if (this.table === 'conversations') {
        const toDelete = rows.filter(r => this._matchesFilters(r));
        toDelete.forEach(r => db.conversations.delete(r.id));
      } else if (this.table === 'conversation_members') {
        db.conversation_members = db.conversation_members.filter(r => !this._matchesFilters(r));
      }
      return resolve({ data: null, error: null });
    }

    // Filter rows
    let matched = rows.filter(r => this._matchesFilters(r));

    if (this.orderClause) {
      matched.sort((a, b) => {
        const valA = a[this.orderClause.col] || 0;
        const valB = b[this.orderClause.col] || 0;
        return this.orderClause.ascending ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      });
    }

    if (this.limitCount !== null) {
      matched = matched.slice(0, this.limitCount);
    }

    // Expand joins if requested (e.g. profile:profiles(...))
    if (this.selectedColumns && this.selectedColumns.includes('profile:profiles')) {
      matched = matched.map(m => {
        const p = db.profiles.get(m.user_id);
        return { ...m, profile: p || null };
      });
    }

    if (this.isSingle) {
      return resolve({ data: matched[0] || null, error: matched.length === 0 ? new Error("Row not found") : null });
    }

    if (this.isMaybeSingle) {
      return resolve({ data: matched[0] || null, error: null });
    }

    return resolve({ data: matched, error: null });
  }
}

const mockSupabase = {
  from(table) {
    return new MockQueryBuilder(table);
  },
  auth: {
    admin: {
      listUsers: async () => ({ data: { users: [] }, error: null })
    }
  },
  rpc: async (fn, args) => {
    return { data: null, error: new Error("RPC fallback to query") };
  }
};

// ── Inject Mocks into Node require.cache ──────────────────────────────────────
const dbPath = path.resolve(__dirname, '../config/database.js');
const sbPath = path.resolve(__dirname, '../config/supabase.js');
const notifPath = path.resolve(__dirname, '../services/notificationService.js');
const rtPath = path.resolve(__dirname, '../services/realtimeService.js');
const transPath = path.resolve(__dirname, '../services/translationService.js');

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockSupabase };
require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: mockSupabase };
require.cache[notifPath] = {
  id: notifPath,
  filename: notifPath,
  loaded: true,
  exports: {
    createNotification: async (payload) => {
      db.notifications.push(payload);
      return { id: 'notif-1' };
    },
    dispatchFastPush: async (payload) => {
      db.pushEvents.push(payload);
      return { success: true };
    }
  }
};
require.cache[rtPath] = {
  id: rtPath,
  filename: rtPath,
  loaded: true,
  exports: {
    emitToUser: async (userId, event, payload) => {
      db.realtimeEvents.push({ target: 'user', userId, event, payload });
    },
    emitToConversation: async (convId, event, payload) => {
      db.realtimeEvents.push({ target: 'conv', convId, event, payload });
    }
  }
};
require.cache[transPath] = {
  id: transPath,
  filename: transPath,
  loaded: true,
  exports: {
    detectLanguage: async () => 'en'
  }
};

// ── IMPORT ACTUAL CHAT CONTROLLER ─────────────────────────────────────────────
const chatController = require('../controllers/chatController');

// ── Helper: Mock Req / Res ───────────────────────────────────────────────────
function mockReqRes({ user, body = {}, params = {}, query = {} }) {
  const req = {
    user: user || null,
    body,
    params,
    query,
    correlationId: `test-corr-${Math.random()}`
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return { req, res };
}

// ── Test Setup Fixtures ──────────────────────────────────────────────────────
const userAlice = { id: 'user-alice-01', username: 'alice', full_name: 'Alice Cooper', avatar_url: 'https://example.com/alice.jpg' };
const userBob = { id: 'user-bob-02', username: 'bob', full_name: 'Bob Marley', avatar_url: 'https://example.com/bob.jpg' };
const userCarol = { id: 'user-carol-03', username: 'carol', full_name: 'Carol Danvers', avatar_url: 'https://example.com/carol.jpg' };
const userEve = { id: 'user-eve-04', username: 'eve', full_name: 'Eve Hacker', avatar_url: 'https://example.com/eve.jpg' };

function setupDb() {
  db.reset();
  db.profiles.set(userAlice.id, { ...userAlice });
  db.profiles.set(userBob.id, { ...userBob });
  db.profiles.set(userCarol.id, { ...userCarol });
  db.profiles.set(userEve.id, { ...userEve });
}

// ── 13-TEST SUITE EXERCISING ACTUAL CONTROLLER ───────────────────────────────
async function runTests() {
  console.log("=== RUNNING PHASE 2B.3 DIRECT CONTROLLER SECURITY TEST SUITE ===");

  // TEST 1: Blocked sender's initial request is rejected before conversation/message inserts & notifications
  {
    setupDb();
    db.user_blocks.push({ blocker_id: userBob.id, blocked_id: userAlice.id });

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['bob'], initialMessage: 'Hey Bob!' }
    });

    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 403, "Must return HTTP 403 when blocked");
    assert.strictEqual(res.body.code, 'BLOCKED', "Must return code: 'BLOCKED'");
    assert.strictEqual(db.conversations.size, 0, "No conversation row must be created");
    assert.strictEqual(db.messages.length, 0, "No message row must be persisted");
    assert.strictEqual(db.notifications.length, 0, "No notification must be dispatched to blocker");
    assert.strictEqual(db.pushEvents.length, 0, "No push notification must be dispatched to blocker");
    console.log("✓ Test 1 Passed: Blocked sender's initial request rejected before conversation/message inserts and notifications.");
  }

  // TEST 2: Application's required block direction(s) are enforced (BLOCKED_BY_YOU and BLOCKED_BY_THEM)
  {
    setupDb();
    // Case 2a: Alice blocked Bob
    db.user_blocks.push({ blocker_id: userAlice.id, blocked_id: userBob.id });
    const { req: reqA, res: resA } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['bob'], initialMessage: 'Unblock test' }
    });
    await chatController.createConversation(reqA, resA);
    assert.strictEqual(resA.statusCode, 403);
    assert.strictEqual(resA.body.error, 'BLOCKED_BY_YOU');

    // Case 2b: Bob blocked Alice
    db.user_blocks = [{ blocker_id: userBob.id, blocked_id: userAlice.id }];
    const { req: reqB, res: resB } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['bob'], initialMessage: 'Unblock test' }
    });
    await chatController.createConversation(reqB, resB);
    assert.strictEqual(resB.statusCode, 403);
    assert.strictEqual(resB.body.error, 'BLOCKED_BY_THEM');
    console.log("✓ Test 2 Passed: Both block directions (BLOCKED_BY_YOU and BLOCKED_BY_THEM) enforced.");
  }

  // TEST 3: Caller who is not a conversation member receives HTTP 403 before message side effects
  {
    setupDb();
    // Create conversation between Alice and Bob
    const convId = 'conv-ab-123';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userBob.id, role: 'member', status: 'accepted' }
    );

    // Eve (non-member) tries to sendMessage to convId
    const { req, res } = mockReqRes({
      user: { id: userEve.id },
      params: { conversationId: convId },
      body: { content: 'Eve hijacking chat' }
    });

    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 403, "Non-member caller must receive HTTP 403");
    assert.strictEqual(res.body.error, "FORBIDDEN");
    assert.strictEqual(db.messages.length, 0, "No message persisted on non-member send");
    assert.strictEqual(db.pushEvents.length, 0, "No push dispatched on non-member send");
    console.log("✓ Test 3 Passed: Caller who is not a conversation member receives HTTP 403 before side effects.");
  }

  // TEST 4: Non-member cannot send using forged sender or participant ID in body
  {
    setupDb();
    const convId = 'conv-ab-123';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userBob.id, role: 'member', status: 'accepted' }
    );

    // Eve passes sender_id: alice in body, but authenticated as eve
    const { req, res } = mockReqRes({
      user: { id: userEve.id },
      params: { conversationId: convId },
      body: { content: 'Forged sender', sender_id: userAlice.id, userId: userAlice.id }
    });

    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "FORBIDDEN");
    assert.strictEqual(db.messages.length, 0);
    console.log("✓ Test 4 Passed: Non-member cannot send using forged sender or participant ID.");
  }

  // TEST 5: Accepted peer with soft-deleted membership can use legitimate reopen path
  {
    setupDb();
    const convId = 'conv-ab-accepted';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    // Bob soft-deleted his view of an accepted chat
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted', is_deleted: false },
      { conversation_id: convId, user_id: userBob.id, role: 'member', status: 'accepted', is_deleted: true, deleted_at: new Date().toISOString() }
    );

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Hello again Bob!' }
    });

    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 200, "Must succeed for accepted chat even if peer soft-deleted");
    const bobMember = db.conversation_members.find(m => m.user_id === userBob.id && m.conversation_id === convId);
    assert.strictEqual(bobMember.is_deleted, false, "Bob membership must be auto-reopened (is_deleted: false)");
    assert.strictEqual(bobMember.deleted_at, null, "deleted_at must be reset to null");
    assert.strictEqual(db.messages.length, 1, "Message must be persisted");
    console.log("✓ Test 5 Passed: Accepted peer with soft-deleted membership successfully auto-reopened on new message.");
  }

  // TEST 6: Blocked peer remains rejected regardless of deletion state
  {
    setupDb();
    const convId = 'conv-ab-blocked';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userBob.id, role: 'member', status: 'accepted' }
    );
    // Bob blocked Alice
    db.user_blocks.push({ blocker_id: userBob.id, blocked_id: userAlice.id });

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Can you hear me?' }
    });

    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'BLOCKED_BY_THEM');
    assert.strictEqual(db.messages.length, 0);
    console.log("✓ Test 6 Passed: Blocked peer remains rejected regardless of deletion state.");
  }

  // TEST 7: Pending requests still reject ordinary messages before insert or notification side effects
  {
    setupDb();
    const convId = 'conv-pending-123';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userCarol.id, role: 'member', status: 'pending', is_deleted: false }
    );

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Unsolicited follow-up message' }
    });

    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'CHAT_REQUEST_PENDING');
    assert.strictEqual(db.messages.length, 0, "No message persisted");
    assert.strictEqual(db.pushEvents.length, 0, "No push dispatched");
    console.log("✓ Test 7 Passed: Pending requests reject ordinary messages before insert or notification.");
  }

  // TEST 8: Declined requests remain rejected and cannot be bypassed by creating another conversation
  {
    setupDb();
    const convId = 'conv-declined-123';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    // Carol declined the request (soft-deleted while status was pending)
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userCarol.id, role: 'member', status: 'pending', is_deleted: true, deleted_at: new Date().toISOString() }
    );

    // 8a: Direct sendMessage to declined conversation
    const { req: sendReq, res: sendRes } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Please answer me Carol' }
    });
    await chatController.sendMessage(sendReq, sendRes);
    assert.strictEqual(sendRes.statusCode, 403);
    assert.strictEqual(sendRes.body.error, 'CHAT_REQUEST_DECLINED');

    // 8b: Attempt to createConversation again with Carol
    const { req: createReq, res: createRes } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'], initialMessage: 'Trying again' }
    });
    await chatController.createConversation(createReq, createRes);
    assert.strictEqual(createRes.statusCode, 403);
    assert.strictEqual(createRes.body.error, 'CHAT_REQUEST_DECLINED');
    console.log("✓ Test 8 Passed: Declined requests remain rejected and cannot be bypassed.");
  }

  // TEST 9: Authorized recipient's acceptance clears is_deleted and deleted_at and sets status: 'accepted'
  {
    setupDb();
    const convId = 'conv-accept-test';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userCarol.id, role: 'member', status: 'pending', is_deleted: true, deleted_at: new Date().toISOString() }
    );

    const { req, res } = mockReqRes({
      user: { id: userCarol.id },
      params: { conversationId: convId }
    });

    await chatController.acceptConversation(req, res);

    assert.strictEqual(res.statusCode, 200);
    const carolMember = db.conversation_members.find(m => m.user_id === userCarol.id && m.conversation_id === convId);
    assert.strictEqual(carolMember.status, 'accepted', "Carol status must be updated to 'accepted'");
    assert.strictEqual(carolMember.is_deleted, false, "Carol is_deleted must be cleared to false");
    assert.strictEqual(carolMember.deleted_at, null, "Carol deleted_at must be reset to null");
    console.log("✓ Test 9 Passed: Authorized recipient acceptance clears is_deleted/deleted_at and sets status to accepted.");
  }

  // TEST 10: Unrelated user cannot accept another recipient's request
  {
    setupDb();
    const convId = 'conv-accept-unrelated';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userCarol.id, role: 'member', status: 'pending' }
    );

    // Eve tries to accept Alice-Carol conversation
    const { req, res } = mockReqRes({
      user: { id: userEve.id },
      params: { conversationId: convId }
    });

    await chatController.acceptConversation(req, res);

    assert.strictEqual(res.statusCode, 404, "Unrelated user must receive 404/not a member");
    const carolMember = db.conversation_members.find(m => m.user_id === userCarol.id && m.conversation_id === convId);
    assert.strictEqual(carolMember.status, 'pending', "Carol status must remain pending");
    console.log("✓ Test 10 Passed: Unrelated user cannot accept another recipient's request.");
  }

  // TEST 11: Mutual-follower direct messaging still works with immediate acceptance
  {
    setupDb();
    // Alice and Bob follow each other mutually
    db.community_follows.push(
      { id: 'f-1', follower_id: userAlice.id, following_id: userBob.id },
      { id: 'f-2', follower_id: userBob.id, following_id: userAlice.id }
    );

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['bob'] }
    });

    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.isMutual, true, "Must recognize mutual followers");
    const bobMember = res.body.conversation.members.find(m => m.user_id === userBob.id);
    assert.strictEqual(bobMember.status, 'accepted', "Recipient in mutual follow must be immediately accepted");
    console.log("✓ Test 11 Passed: Mutual-follower direct messaging starts with immediate acceptance.");
  }

  // TEST 12: Non-mutual profile navigation creates no conversation or notification without explicit request submission
  {
    setupDb();
    // Alice and Carol are NOT mutual followers
    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'] } // No initialMessage
    });

    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.requiresRequest, true, "Must return requiresRequest: true");
    assert.strictEqual(res.body.isMutual, false);
    assert.strictEqual(db.conversations.size, 0, "No conversation row in database");
    assert.strictEqual(db.messages.length, 0, "No message row in database");
    assert.strictEqual(db.notifications.length, 0, "Zero notifications dispatched");
    assert.strictEqual(db.pushEvents.length, 0, "Zero push notifications dispatched");
    console.log("✓ Test 12 Passed: Non-mutual profile navigation creates no conversation or notification without explicit request.");
  }

  // TEST 13: Eligible introductory request persists and dispatches only intended request side effects
  {
    setupDb();
    const introMsg = 'Hello Carol, I found your photography work inspiring!';
    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'], initialMessage: introMsg }
    });

    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(db.conversations.size, 1, "Exactly one conversation created");
    assert.strictEqual(db.messages.length, 1, "Exactly one introductory message persisted");
    assert.strictEqual(db.messages[0].content, introMsg);
    assert.strictEqual(db.notifications.length, 1, "Exactly one chat_request notification created");
    assert.strictEqual(db.notifications[0].type, 'chat_request');
    assert.strictEqual(db.pushEvents.length, 1, "Exactly one fast push dispatched");
    assert.strictEqual(db.pushEvents[0].type, 'chat_request');
    const carolMember = res.body.conversation.members.find(m => m.user_id === userCarol.id);
    assert.strictEqual(carolMember.status, 'pending', "Recipient member status must be pending");
    console.log("✓ Test 13 Passed: Eligible introductory request dispatches exactly intended request side effects.");
  }

  // TEST 14: createConversation block-query database error fails closed (HTTP 500) before any side effects
  {
    setupDb();
    // Simulate database query failure for user_blocks
    db.tableErrors.set('user_blocks', { message: 'Database connection timeout', code: 'ETIMEDOUT' });

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'], initialMessage: 'Introductory request' }
    });

    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 500, "Must return HTTP 500 on block query error");
    assert.strictEqual(res.body.error, 'Failed to verify block permissions');
    assert.strictEqual(db.conversations.size, 0, "Must not create conversation on block query failure");
    assert.strictEqual(db.conversation_members.length, 0, "Must not create members on block query failure");
    assert.strictEqual(db.messages.length, 0, "Must not insert messages on block query failure");
    assert.strictEqual(db.notifications.length, 0, "Must not dispatch notifications on block query failure");
    assert.strictEqual(db.pushEvents.length, 0, "Must not dispatch push on block query failure");
    assert.strictEqual(db.realtimeEvents.length, 0, "Must not emit realtime events on block query failure");
    console.log("✓ Test 14 Passed: createConversation block-query failure aborts immediately before any inserts or notifications.");
  }

  // TEST 15: sendMessage block-query database error fails closed (HTTP 500) before any side effects
  {
    setupDb();
    const convId = 'conv-ab-accepted';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted', is_deleted: false },
      { conversation_id: convId, user_id: userBob.id, role: 'member', status: 'accepted', is_deleted: false }
    );

    // Simulate database query failure for user_blocks
    db.tableErrors.set('user_blocks', { message: 'PostgREST query error on user_blocks', code: 'PGRST500' });

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Test message during block outage' }
    });

    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 500, "Must return HTTP 500 on block query error");
    assert.strictEqual(res.body.error, 'Failed to verify block permissions');
    assert.strictEqual(db.messages.length, 0, "Must not persist message on block query failure");
    assert.strictEqual(db.pushEvents.length, 0, "Must not dispatch push on block query failure");
    assert.strictEqual(db.realtimeEvents.length, 0, "Must not emit realtime events on block query failure");
    console.log("✓ Test 15 Passed: sendMessage block-query failure aborts immediately before any message persistence or side effects.");
  }

  // TEST 16: Successful empty user_blocks query permits normal unblocked conversation creation and message sending
  {
    setupDb();
    // Explicitly confirm empty user_blocks query returns { data: [], error: null } and proceeds normally
    assert.strictEqual(db.user_blocks.length, 0, "Initial user_blocks must be empty");

    // 16a: Normal unblocked introductory request creation
    const { req: createReq, res: createRes } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'], initialMessage: 'Hello Carol, unblocked flow!' }
    });
    await chatController.createConversation(createReq, createRes);
    assert.strictEqual(createRes.statusCode, 200, "Unblocked request must succeed with HTTP 200");
    assert.strictEqual(db.conversations.size, 1, "Conversation created for eligible unblocked user");
    assert.strictEqual(db.messages.length, 1, "Introductory message persisted for unblocked user");

    // 16b: Normal unblocked message sending in active conversation
    const convId = Array.from(db.conversations.keys())[0];
    // Manually accept Carol so conversation is active
    const carolMember = db.conversation_members.find(m => m.user_id === userCarol.id);
    carolMember.status = 'accepted';

    const { req: sendReq, res: sendRes } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Follow-up message in active unblocked chat' }
    });
    await chatController.sendMessage(sendReq, sendRes);
    assert.strictEqual(sendRes.statusCode, 200, "Unblocked message send must succeed with HTTP 200");
    assert.strictEqual(db.messages.length, 2, "Second message persisted successfully");
    console.log("✓ Test 16 Passed: Successful empty user_blocks query permits normal unblocked flows without false rejection.");
  }
  // TEST 17: Partial member insertion failure fails closed (HTTP 500) and cleans up orphaned conversation
  {
    setupDb();
    // Simulate selective failure for Carol during conversation_members insertion
    db.failMemberInsertForUser = userCarol.id;

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'], initialMessage: 'Introductory request text' }
    });
    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 500, "Must return HTTP 500 on incomplete member insertion");
    assert.strictEqual(res.body.error, 'CONVERSATION_MEMBER_INSERTION_FAILED');
    assert.strictEqual(res.body.cleanupSucceeded, true, "Rollback cleanup must be reported as succeeded");
    assert.strictEqual(db.conversations.size, 0, "Orphaned conversation must be removed from database");
    assert.strictEqual(db.notifications.length, 0, "Must not dispatch notifications on partial member failure");
    assert.strictEqual(db.pushEvents.length, 0, "Must not dispatch push on partial member failure");
    assert.strictEqual(db.realtimeEvents.length, 0, "Must not emit realtime events on partial member failure");

    db.failMemberInsertForUser = null;
    console.log("✔ Test 17 Passed: Partial conversation-member insertion failure aborts and rolls back conversation.");
  }

  // TEST 18: Initial introductory-message persistence failure fails closed (HTTP 500) and deletes conversation
  {
    setupDb();
    // Simulate failure specifically when persisting messages
    db.tableErrors.set('messages', { message: 'Simulated messages table write failure', code: 'PGRST500' });

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      body: { type: 'direct', participants: ['carol'], initialMessage: 'Introductory request that fails to persist' }
    });
    await chatController.createConversation(req, res);

    assert.strictEqual(res.statusCode, 500, "Must return HTTP 500 on initial message persistence failure");
    assert.strictEqual(res.body.error, 'INITIAL_MESSAGE_PERSISTENCE_FAILED');
    assert.strictEqual(res.body.cleanupSucceeded, true, "Rollback cleanup must be reported as succeeded");
    assert.strictEqual(db.conversations.size, 0, "Conversation row must be removed when message persistence fails");
    assert.strictEqual(db.notifications.length, 0, "Must not dispatch notifications on initial message failure");
    assert.strictEqual(db.pushEvents.length, 0, "Must not dispatch push on initial message failure");
    assert.strictEqual(db.realtimeEvents.length, 0, "Must not emit realtime events on initial message failure");

    db.tableErrors.delete('messages');
    console.log("✔ Test 18 Passed: Initial introductory-message persistence failure aborts and rolls back conversation.");
  }

  // TEST 19: Malformed 1-member direct conversation is rejected by sendMessage (HTTP 400)
  {
    setupDb();
    const convId = 'conv-direct-malformed';
    db.conversations.set(convId, { id: convId, type: 'direct' });
    // Corrupted state: only Alice is in the conversation
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' }
    );

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Message into malformed 1-member conversation' }
    });
    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 400, "Must return HTTP 400 on malformed direct membership count");
    assert.strictEqual(res.body.error, 'INVALID_CONVERSATION_SHAPE');
    assert.strictEqual(res.body.message, 'Direct conversation must have exactly two members.');
    assert.strictEqual(db.messages.length, 0, "Must not persist message in malformed conversation");
    assert.strictEqual(db.pushEvents.length, 0, "Must not dispatch push in malformed conversation");
    console.log("✔ Test 19 Passed: Malformed 1-member direct conversation fails closed without side effects.");
  }

  // TEST 20: 2-member group conversation bypasses direct-chat request gates and 1-on-1 block checks
  {
    setupDb();
    const convId = 'conv-group-2-members';
    db.conversations.set(convId, { id: convId, type: 'group' });
    // Legitimate group conversation that happens to have exactly 2 members
    db.conversation_members.push(
      { conversation_id: convId, user_id: userAlice.id, role: 'admin', status: 'accepted' },
      { conversation_id: convId, user_id: userBob.id, role: 'member', status: 'pending' }
    );
    // Bob blocked Alice (would block direct chat, but does not block group chat)
    db.user_blocks.push({ blocker_id: userBob.id, blocked_id: userAlice.id });

    const { req, res } = mockReqRes({
      user: { id: userAlice.id },
      params: { conversationId: convId },
      body: { content: 'Message to legitimate 2-person group chat' }
    });
    await chatController.sendMessage(req, res);

    assert.strictEqual(res.statusCode, 200, "2-member group conversation must proceed without direct request gates");
    assert.strictEqual(db.messages.length, 1, "Group message persisted successfully");
    console.log("✔ Test 20 Passed: 2-member group conversation correctly bypasses direct request gates.");
  }


  console.log("\n==================================================================");
  console.log("ALL 20 PHASE 2B DIRECT CONTROLLER SECURITY TESTS PASSED 100%!");
  console.log("==================================================================\n");
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
