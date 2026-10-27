const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Unref background interval timers so test process drains cleanly if run
const _origSetInterval = global.setInterval;
global.setInterval = function(...args) {
  const timer = _origSetInterval.apply(this, args);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
};

// ── Isolated In-Memory Mock Store ──────────────────────────────────────────
class MockDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.conversation_members = [];
    this.messages = [];
    this.executedQueries = [];
    this.simulatedError = null;
  }
}

const db = new MockDatabase();

// ── Mock Query Builder with Query-Audit Capabilities ───────────────────────
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
  }

  select(cols = '*') {
    this.selectedColumns = cols;
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

  gt(col, val) {
    this.filters.push({ col, op: 'gt', val });
    return this;
  }

  lt(col, val) {
    this.filters.push({ col, op: 'lt', val });
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

  limit(count) {
    this.limitCount = count;
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
      if (f.op === 'gt' && !(new Date(row[f.col]).getTime() > new Date(f.val).getTime())) return false;
      if (f.op === 'lt' && !(new Date(row[f.col]).getTime() < new Date(f.val).getTime())) return false;
      if (f.op === 'ilike') {
        const pattern = f.val.replace(/%/g, '').toLowerCase();
        const strVal = String(row[f.col] || '').toLowerCase();
        if (!strVal.includes(pattern)) return false;
      }
    }
    return true;
  }

  then(resolve, reject) {
    // Record that a query was executed against this table
    db.executedQueries.push({
      table: this.table,
      filters: [...this.filters],
      selectedColumns: this.selectedColumns
    });

    // Check for simulated error on this table
    if (db.simulatedError && db.simulatedError.table === this.table) {
      return resolve({ data: null, error: db.simulatedError.error });
    }

    let rows = db[this.table] || [];
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

    if (this.isSingle) {
      return resolve({
        data: matched[0] || null,
        error: matched.length === 0 ? new Error("Row not found") : null
      });
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
  }
};
mockSupabase.supabase = mockSupabase;

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
    createNotification: async () => ({ id: 'notif-1' }),
    dispatchFastPush: async () => ({ success: true })
  }
};
require.cache[rtPath] = {
  id: rtPath,
  filename: rtPath,
  loaded: true,
  exports: {
    emitToUser: async () => {},
    emitToConversation: async () => {}
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

// ── Import Controller Under Test with Scoped Module Loader Interception ──────
const Module = require('module');
const origModuleLoad = Module._load;

let chatController;
try {
  Module._load = function (request, parent, isMain) {
    if (request === 'sentiment') {
      return function MockSentiment() {
        this.analyze = () => ({ score: 0, comparative: 0 });
      };
    }
    return origModuleLoad.apply(this, arguments);
  };

  chatController = require('../controllers/chatController');
} finally {
  Module._load = origModuleLoad;
}

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
const userAlice = { id: 'user-alice-01', username: 'alice' };
const userBob = { id: 'user-bob-02', username: 'bob' };
const convId = 'conv-private-101';

// ── REGRESSION TEST SUITE: FAIL-CLOSED MEMBERSHIP AUTHORIZATION ─────────────

test('getMessages: non-member is rejected with HTTP 403 and never executes messages query', async () => {
  db.reset();
  // Only Alice is a member of conv-private-101
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });
  db.messages.push({
    id: 'msg-secret-1',
    conversation_id: convId,
    content: 'Top secret private conversation content',
    is_deleted: false,
    created_at: '2026-10-27T10:00:00Z'
  });

  // Bob (authenticated non-member) attempts to fetch messages
  const { req, res } = mockReqRes({
    user: { id: userBob.id },
    params: { conversationId: convId }
  });

  await chatController.getMessages(req, res);

  assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 for non-member');
  assert.strictEqual(res.body.error, 'Access denied or conversation not found');
  
  // Guard check: assert no query was dispatched to the messages table
  const messagesQueries = db.executedQueries.filter(q => q.table === 'messages');
  assert.strictEqual(messagesQueries.length, 0, 'No query against messages table must run when membership is denied');
});

test('getMessages: membership-query database error fails closed with HTTP 500 and never executes messages query', async () => {
  db.reset();
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });
  db.messages.push({
    id: 'msg-secret-1',
    conversation_id: convId,
    content: 'Top secret',
    is_deleted: false,
    created_at: '2026-10-27T10:00:00Z'
  });

  // Simulate database failure during membership lookup
  db.simulatedError = {
    table: 'conversation_members',
    error: { message: 'Database connection timeout', code: 'ECONNRESET' }
  };

  const { req, res } = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId }
  });

  await chatController.getMessages(req, res);

  assert.strictEqual(res.statusCode, 500, 'Must fail closed with HTTP 500 on DB error');
  assert.strictEqual(res.body.error, 'Server Error');

  const messagesQueries = db.executedQueries.filter(q => q.table === 'messages');
  assert.strictEqual(messagesQueries.length, 0, 'No query against messages table must run when membership query errors');
});

test('getMessages: legitimate member can retrieve messages successfully (HTTP 200)', async () => {
  db.reset();
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });
  db.messages.push({
    id: 'msg-1',
    conversation_id: convId,
    content: 'Hello world',
    is_deleted: false,
    created_at: '2026-10-27T10:00:00Z'
  });

  const { req, res } = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId }
  });

  await chatController.getMessages(req, res);

  assert.strictEqual(res.statusCode, 200, 'Legitimate member must receive HTTP 200');
  assert.ok(Array.isArray(res.body), 'Response body must be an array of messages');
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].content, 'Hello world');

  const messagesQueries = db.executedQueries.filter(q => q.table === 'messages');
  assert.ok(messagesQueries.length > 0, 'Messages query must execute for valid member');
});

test('getMessages: cleared_at watermark excludes messages created on or before clear timestamp', async () => {
  db.reset();
  const clearTimestamp = '2026-10-27T10:30:00Z';
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: clearTimestamp
  });
  db.messages.push({
    id: 'msg-pre-clear',
    conversation_id: convId,
    content: 'Message before clear',
    is_deleted: false,
    created_at: '2026-10-27T10:15:00Z'
  });
  db.messages.push({
    id: 'msg-post-clear',
    conversation_id: convId,
    content: 'Message after clear',
    is_deleted: false,
    created_at: '2026-10-27T10:45:00Z'
  });

  const { req, res } = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId }
  });

  await chatController.getMessages(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].id, 'msg-post-clear', 'Only post-clear message must be returned');
});

test('getMessages: missing conversationId parameter returns HTTP 400', async () => {
  db.reset();
  const { req, res } = mockReqRes({
    user: { id: userAlice.id },
    params: {}
  });

  await chatController.getMessages(req, res);

  assert.strictEqual(res.statusCode, 400, 'Must return HTTP 400 when conversationId is missing');
  assert.strictEqual(res.body.error, 'Missing conversationId');
});

test('searchMessages: non-member is rejected with HTTP 403 and never executes search query', async () => {
  db.reset();
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });
  db.messages.push({
    id: 'msg-secret-2',
    conversation_id: convId,
    content: 'Confidential project details',
    is_deleted: false,
    created_at: '2026-10-27T10:00:00Z'
  });

  const { req, res } = mockReqRes({
    user: { id: userBob.id },
    params: { conversationId: convId },
    query: { q: 'Confidential' }
  });

  await chatController.searchMessages(req, res);

  assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 for non-member in searchMessages');
  assert.strictEqual(res.body.error, 'Access denied to conversation');

  const messagesQueries = db.executedQueries.filter(q => q.table === 'messages');
  assert.strictEqual(messagesQueries.length, 0, 'No query against messages table must run when search authorization fails');
});

test('searchMessages: membership-query database error fails closed with HTTP 403 and never executes search query', async () => {
  db.reset();
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });

  db.simulatedError = {
    table: 'conversation_members',
    error: { message: 'Database connection failed', code: 'PGRST500' }
  };

  const { req, res } = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId },
    query: { q: 'test' }
  });

  await chatController.searchMessages(req, res);

  assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 (fail closed) on membership lookup error');
  assert.strictEqual(res.body.error, 'Access denied to conversation');

  const messagesQueries = db.executedQueries.filter(q => q.table === 'messages');
  assert.strictEqual(messagesQueries.length, 0, 'No query against messages table must run when membership query errors');
});

test('searchMessages: legitimate member can search messages successfully (HTTP 200)', async () => {
  db.reset();
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });
  db.messages.push({
    id: 'msg-search-1',
    conversation_id: convId,
    content: 'Discussing the quarterly roadmap',
    is_deleted: false,
    created_at: '2026-10-27T10:00:00Z'
  });

  const { req, res } = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId },
    query: { q: 'roadmap' }
  });

  await chatController.searchMessages(req, res);

  assert.strictEqual(res.statusCode, 200, 'Legitimate member must be able to search');
  assert.strictEqual(res.body.success, true, 'Response must indicate success');
  assert.ok(Array.isArray(res.body.messages), 'Messages must be an array in response object');
  assert.strictEqual(res.body.messages.length, 1);
  assert.strictEqual(res.body.messages[0].id, 'msg-search-1');
  assert.strictEqual(res.body.total, 1, 'Total must match count of found messages');

  const messagesQueries = db.executedQueries.filter(q => q.table === 'messages');
  assert.ok(messagesQueries.length > 0, 'Messages query must execute for valid member');
});

test('searchMessages: missing parameters and empty query handling', async () => {
  db.reset();
  db.conversation_members.push({
    conversation_id: convId,
    user_id: userAlice.id,
    cleared_at: null
  });

  // Missing conversationId
  const reqNoConv = mockReqRes({
    user: { id: userAlice.id },
    params: {},
    query: { q: 'test' }
  });
  await chatController.searchMessages(reqNoConv.req, reqNoConv.res);
  assert.strictEqual(reqNoConv.res.statusCode, 400);
  assert.strictEqual(reqNoConv.res.body.error, 'Valid conversation ID is required');

  // Empty search query q returns HTTP 200 with empty results
  const reqEmptyQ = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId },
    query: { q: '' }
  });
  await chatController.searchMessages(reqEmptyQ.req, reqEmptyQ.res);
  assert.strictEqual(reqEmptyQ.res.statusCode, 200);
  assert.strictEqual(reqEmptyQ.res.body.success, true);
  assert.deepStrictEqual(reqEmptyQ.res.body.messages, []);
  assert.strictEqual(reqEmptyQ.res.body.total, 0);

  // Missing query q entirely returns HTTP 200 with empty results
  const reqNoQ = mockReqRes({
    user: { id: userAlice.id },
    params: { conversationId: convId },
    query: {}
  });
  await chatController.searchMessages(reqNoQ.req, reqNoQ.res);
  assert.strictEqual(reqNoQ.res.statusCode, 200);
  assert.strictEqual(reqNoQ.res.body.success, true);
  assert.deepStrictEqual(reqNoQ.res.body.messages, []);
  assert.strictEqual(reqNoQ.res.body.total, 0);
});
