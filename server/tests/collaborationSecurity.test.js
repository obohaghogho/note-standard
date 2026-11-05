const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// ── In-Memory Mock Database ──────────────────────────────────────────────────
class MockDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.team_members = [];
    this.workspace_roles = [];
    this.departments = [];
    this.workspace_activities = [];
    this.executedQueries = [];
    this.simulatedError = null;
    this.simulatedAuthError = null;
    this.simulatedValidationQueryError = null;
    this.simulatedUpdateError = null;
    this.announcements = [];
    this.projects = [];
    this.tasks = [];
    this.task_checklists = [];
    this.task_comments = [];
    this.workspace_files = [];
    this.meetings = [];
    this.profiles = [];
    this.simulatedAnnouncementInsertError = null;
    this.simulatedAnnouncementSelectError = null;
    this.simulatedActivitySelectError = null;
  }
}

const db = new MockDatabase();

// ── Canonical Test UUID Constants ───────────────────────────────────────────
const TEAM_1_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_2_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TARGET_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NON_MEMBER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const AUTH_QUERY_FAIL_USER_ID = '99999999-0000-4000-8000-000000000000';

const CUSTOM_ROLE_VALID_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CUSTOM_ROLE_TEAM2_ID = '77777777-7777-4777-8777-777777777777';
const CUSTOM_ROLE_ADMIN_NAMED_ID = '88888888-8888-4888-8888-888888888888';
const CUSTOM_ROLE_MANAGE_MEMBERS_ID = '88888888-8888-4888-8888-888888888889';

const DEPT_ACTIVE_ID = '99999999-9999-4999-8999-999999999999';
const DEPT_INACTIVE_ID = '00000000-0000-4000-8000-000000000000';

// ── Chainable Mock Query Builder with Query-Scoping Recording ────────────────
class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.selectedColumns = '*';
    this.insertedRow = null;
    this.updatedFields = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.isDelete = false;
  }

  select(cols = '*') {
    this.selectedColumns = cols;
    return this;
  }

  eq(col, val) {
    this.filters.push({ col, val, op: 'eq' });
    return this;
  }

  neq(col, val) {
    this.filters.push({ col, val, op: 'neq' });
    return this;
  }

  in(col, vals) {
    this.filters.push({ col, val: Array.isArray(vals) ? [...vals] : vals, op: 'in' });
    return this;
  }

  order(col, opts = {}) {
    this.orderBy = { col, ascending: opts.ascending !== false };
    return this;
  }

  is(col, val) {
    this.filters.push({ col, val, op: 'is' });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this.execute();
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this.execute();
  }

  insert(payload) {
    this.insertedRow = Array.isArray(payload) ? payload[0] : payload;
    return this;
  }

  update(payload) {
    this.updatedFields = payload;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  async execute() {
    // Record executed query for explicit scoping assertions
    db.executedQueries.push({
      table: this.table,
      action: this.isDelete ? 'delete' : (this.updatedFields ? 'update' : (this.insertedRow ? 'insert' : 'select')),
      filters: this.filters.map(f => ({ ...f })),
      selectedColumns: this.selectedColumns,
      updatedFields: this.updatedFields ? { ...this.updatedFields } : null,
      orderBy: this.orderBy ? { ...this.orderBy } : null,
      limitCount: this.limitCount ?? null,
      isSingle: this.isSingle,
      isMaybeSingle: this.isMaybeSingle
    });

    if (db.simulatedError) {
      return { data: null, error: db.simulatedError };
    }

    if (this.table === 'team_members' && this.filters.some(f => f.col === 'user_id' && f.val === AUTH_QUERY_FAIL_USER_ID)) {
      return { data: null, error: { message: 'Database connection failure during auth verification', code: '500' } };
    }

    if (db.simulatedAuthError && this.table === 'team_members') {
      return { data: null, error: db.simulatedAuthError };
    }

    if (db.simulatedValidationQueryError && (this.table === 'workspace_roles' || this.table === 'departments')) {
      return { data: null, error: db.simulatedValidationQueryError };
    }

    const tableData = db[this.table] || [];

    const matchRow = (row) => {
      return this.filters.every((f) => {
        if (f.op === 'eq') return String(row[f.col]) === String(f.val);
        if (f.op === 'neq') return String(row[f.col]) !== String(f.val);
        if (f.op === 'in') return Array.isArray(f.val) && f.val.map(String).includes(String(row[f.col]));
        if (f.op === 'is') return (f.val === null ? (row[f.col] === null || row[f.col] === undefined) : row[f.col] === f.val);
        return true;
      });
    };

    // DELETE
    if (this.isDelete) {
      const remainingRows = [];
      const deletedRows = [];
      tableData.forEach((row) => {
        if (matchRow(row)) {
          deletedRows.push({ ...row });
        } else {
          remainingRows.push(row);
        }
      });
      db[this.table] = remainingRows;
      return { data: deletedRows, error: null };
    }

    // UPDATE
    if (this.updatedFields) {
      if (db.simulatedUpdateError) {
        return { data: null, error: db.simulatedUpdateError };
      }
      let updatedRows = [];
      tableData.forEach((row) => {
        if (matchRow(row)) {
          Object.assign(row, this.updatedFields);
          updatedRows.push({ ...row });
        }
      });
      if (this.isSingle) {
        if (updatedRows.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        }
        return { data: updatedRows[0], error: null };
      }
      if (this.isMaybeSingle) {
        return { data: updatedRows.length > 0 ? updatedRows[0] : null, error: null };
      }
      return { data: updatedRows, error: null };
    }

    // INSERT
    if (this.insertedRow) {
      if (this.table === 'announcements' && db.simulatedAnnouncementInsertError) {
        return { data: null, error: db.simulatedAnnouncementInsertError };
      }
      const newRow = {
        id: this.insertedRow.id || require('node:crypto').randomUUID(),
        created_at: '2026-01-01T00:00:00.000Z',
        ...this.insertedRow
      };
      tableData.push(newRow);
      return { data: newRow, error: null };
    }

    // SELECT
    if (this.table === 'announcements' && db.simulatedAnnouncementSelectError) {
      return { data: null, error: db.simulatedAnnouncementSelectError };
    }
    if (this.table === 'workspace_activities' && db.simulatedActivitySelectError) {
      return { data: null, error: db.simulatedActivitySelectError };
    }

    let results = tableData.filter(matchRow);

    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      results = [...results].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        return ascending ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
      });
    }

    if (typeof this.limitCount === 'number') {
      results = results.slice(0, this.limitCount);
    }

    if (this.isSingle) {
      if (results.length === 0) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      }
      return { data: results[0], error: null };
    }

    if (this.isMaybeSingle) {
      return { data: results.length > 0 ? results[0] : null, error: null };
    }

    return { data: results, error: null };
  }
}

// ── Mock Supabase Client & High-Fidelity Realtime Mock ───────────────────────
const mockSupabase = {
  from: (table) => new MockQueryBuilder(table)
};

// Signature: emit(type, room, event, payload, options = {})
const realtimeEvents = [];
const mockRealtime = {
  emit: async (type, room, event, payload, options = {}) => {
    realtimeEvents.push({ type, room, event, payload, options });
  }
};

// ── Intercept Require Cache ──────────────────────────────────────────────────
const dbPath = require.resolve('../config/database');
const realtimePath = require.resolve('../services/realtimeService');

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockSupabase };
require.cache[realtimePath] = { id: realtimePath, filename: realtimePath, loaded: true, exports: mockRealtime };

const collaborationController = require('../controllers/collaborationController');

// ── Helper to Seed Standard Baseline ────────────────────────────────────────
function seedBaseline() {
  db.reset();
  realtimeEvents.length = 0;

  // Seed team_members
  db.team_members = [
    { team_id: TEAM_1_ID, user_id: OWNER_ID, role: 'owner', custom_role_id: null, department_id: null },
    { team_id: TEAM_1_ID, user_id: ADMIN_ID, role: 'admin', custom_role_id: null, department_id: null },
    { team_id: TEAM_1_ID, user_id: MEMBER_ID, role: 'member', custom_role_id: null, department_id: null },
    { team_id: TEAM_1_ID, user_id: TARGET_USER_ID, role: 'member', custom_role_id: null, department_id: null },
    { team_id: TEAM_2_ID, user_id: OWNER_ID, role: 'owner', custom_role_id: null, department_id: null }
  ];

  // Seed workspace_roles
  db.workspace_roles = [
    {
      id: CUSTOM_ROLE_VALID_ID,
      team_id: TEAM_1_ID,
      name: 'Content Writer',
      permissions: { notes: true, chat: true, projects: false }
    },
    {
      id: CUSTOM_ROLE_TEAM2_ID,
      team_id: TEAM_2_ID,
      name: 'External Role',
      permissions: { notes: true }
    },
    {
      id: CUSTOM_ROLE_ADMIN_NAMED_ID,
      team_id: TEAM_1_ID,
      name: 'Administrator',
      permissions: { admin: true }
    },
    {
      id: CUSTOM_ROLE_MANAGE_MEMBERS_ID,
      team_id: TEAM_1_ID,
      name: 'Staff Coordinator',
      permissions: { manage_members: true }
    }
  ];

  // Seed departments (global schema)
  db.departments = [
    { id: DEPT_ACTIVE_ID, name: 'Engineering', status: 'active' },
    { id: DEPT_INACTIVE_ID, name: 'Legacy Deprecated', status: 'archived' }
  ];

  // Seed projects
  db.projects = [
    { id: '10101010-1010-4010-8010-101010101010', team_id: TEAM_1_ID, name: 'Core Platform', owner_id: OWNER_ID, priority: 'high', budget: 1000 },
    { id: '20202020-2020-4020-8020-202020202020', team_id: TEAM_2_ID, name: 'External Secret', owner_id: OWNER_ID, priority: 'low', budget: 500 }
  ];

  // Seed tasks
  db.tasks = [
    { id: '30303030-3030-4030-8030-303030303030', project_id: '10101010-1010-4010-8010-101010101010', title: 'Task 1', priority: 'medium', status: 'todo' },
    { id: '40404040-4040-4040-8040-404040404040', project_id: '20202020-2020-4020-8020-202020202020', title: 'Secret Task', priority: 'high', status: 'todo' }
  ];

  // Seed task_checklists
  db.task_checklists = [
    { id: '50505050-5050-4050-8050-505050505050', task_id: '30303030-3030-4030-8030-303030303030', title: 'Subtask 1', completed: false },
    { id: '60606060-6060-4060-8060-606060606060', task_id: '40404040-4040-4040-8040-404040404040', title: 'Secret Item', completed: false }
  ];

  // Seed task_comments
  db.task_comments = [
    { id: '70707070-7070-4070-8070-707070707070', task_id: '30303030-3030-4030-8030-303030303030', user_id: OWNER_ID, content: 'Initial comment' }
  ];

  // Seed workspace_files
  db.workspace_files = [
    { id: '80808080-8080-4080-8080-808080808080', team_id: TEAM_1_ID, name: 'Doc.pdf', is_folder: false, is_recycled: false, created_by: MEMBER_ID, file_size: 1024 },
    { id: '81818181-8181-4181-8181-818181818181', team_id: TEAM_2_ID, name: 'Secret.pdf', is_folder: false, is_recycled: false, created_by: OWNER_ID, file_size: 2048 }
  ];

  // Seed meetings
  db.meetings = [
    { id: '90909090-9090-4090-8090-909090909090', team_id: TEAM_1_ID, title: 'Sprint Sync', status: 'scheduled' },
    { id: '91919191-9191-4191-8191-919191919191', team_id: TEAM_2_ID, title: 'Exec Meeting', status: 'scheduled' }
  ];

  // Seed profiles
  db.profiles = [
    { id: OWNER_ID, role: 'admin', is_online: true },
    { id: ADMIN_ID, role: 'user', is_online: true },
    { id: MEMBER_ID, role: 'user', is_online: false },
    { id: NON_MEMBER_ID, role: 'user', is_online: false }
  ];
}

// ── Request / Response Invocation Harness ────────────────────────────────────
function createMockRes() {
  return {
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
}

async function invoke(handler, req, res = createMockRes()) {
  let nextErr = null;
  const next = (err) => {
    nextErr = err;
  };
  await handler(req, res, next);
  return { res, nextErr };
}

// ── Scoping Helper Assertions ────────────────────────────────────────────────
function assertQueryFilter(query, col, expectedVal) {
  assert.ok(query, `Expected query on table was not executed`);
  const match = query.filters.find(f => f.col === col && f.op === 'eq');
  assert.ok(match, `Filter on column '${col}' was not found in query`);
  assert.strictEqual(String(match.val), String(expectedVal), `Filter on column '${col}' had unexpected value`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: COLLABORATION SECURITY
// ══════════════════════════════════════════════════════════════════════════════

test('Collaboration Endpoint Security Repairs', async (t) => {

  // ── 1. AUTHENTICATION & AUTHORIZATION BOUNDARIES ───────────────────────────
  await t.test('Authentication and authorization boundaries', async (st) => {

    await st.test('Custom role: unauthenticated requester is rejected with 401', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID }
      }; // no req.user
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error);
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
      assert.strictEqual(db.executedQueries.length, 0, 'No database queries should execute for unauthenticated caller');
    });

    await st.test('Department: unauthenticated requester is rejected with 401', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID }
      }; // no req.user
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error);
      assert.strictEqual(db.executedQueries.length, 0);
    });

    await st.test('Custom role: ordinary member requester is rejected with 403', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: MEMBER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error);
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);

      // Verify requester check scoping
      const authQuery = db.executedQueries.find(q => q.table === 'team_members' && q.selectedColumns === 'role');
      assertQueryFilter(authQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(authQuery, 'user_id', MEMBER_ID);
    });

    await st.test('Department: ordinary member requester is rejected with 403', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: MEMBER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error);

      const authQuery = db.executedQueries.find(q => q.table === 'team_members' && q.selectedColumns === 'role');
      assertQueryFilter(authQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(authQuery, 'user_id', MEMBER_ID);
    });

    await st.test('Custom role: non-member requester is rejected with 403', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: NON_MEMBER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error);
      assert.strictEqual(realtimeEvents.length, 0);
    });

    await st.test('Department: non-member requester is rejected with 403', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: NON_MEMBER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error);
    });

    await st.test('Custom role: authenticated team admin is authorized (200)', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.custom_role_id, CUSTOM_ROLE_VALID_ID);

      // Verify query scoping across the full lifecycle
      const authQuery = db.executedQueries[0];
      assert.strictEqual(authQuery.table, 'team_members');
      assertQueryFilter(authQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(authQuery, 'user_id', ADMIN_ID);

      const targetCheckQuery = db.executedQueries[1];
      assert.strictEqual(targetCheckQuery.table, 'team_members');
      assertQueryFilter(targetCheckQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(targetCheckQuery, 'user_id', TARGET_USER_ID);

      const roleLookupQuery = db.executedQueries[2];
      assert.strictEqual(roleLookupQuery.table, 'workspace_roles');
      assertQueryFilter(roleLookupQuery, 'id', CUSTOM_ROLE_VALID_ID);

      const updateQuery = db.executedQueries[3];
      assert.strictEqual(updateQuery.table, 'team_members');
      assert.strictEqual(updateQuery.action, 'update');
      assertQueryFilter(updateQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(updateQuery, 'user_id', TARGET_USER_ID);
      assert.strictEqual(updateQuery.updatedFields.custom_role_id, CUSTOM_ROLE_VALID_ID);
    });

    await st.test('Department: authenticated team admin is authorized (200)', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.department_id, DEPT_ACTIVE_ID);

      // Verify query scoping
      const deptLookupQuery = db.executedQueries.find(q => q.table === 'departments');
      assertQueryFilter(deptLookupQuery, 'id', DEPT_ACTIVE_ID);

      const updateQuery = db.executedQueries.find(q => q.action === 'update');
      assert.strictEqual(updateQuery.table, 'team_members');
      assertQueryFilter(updateQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(updateQuery, 'user_id', TARGET_USER_ID);
      assert.strictEqual(updateQuery.updatedFields.department_id, DEPT_ACTIVE_ID);
    });

    await st.test('Custom role: authenticated team owner is authorized (200)', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: OWNER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.custom_role_id, CUSTOM_ROLE_VALID_ID);
    });

    await st.test('Department: authenticated team owner is authorized (200)', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: OWNER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.department_id, DEPT_ACTIVE_ID);
    });

    await st.test('Custom role: authorization query failure fails closed and propagates error to next', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: AUTH_QUERY_FAIL_USER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.ok(nextErr, 'Must fail closed by propagating query error to next()');
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });

    await st.test('Department: authorization query failure fails closed and propagates error to next', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: AUTH_QUERY_FAIL_USER_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.ok(nextErr, 'Must fail closed by propagating query error to next()');
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });
  });

  // ── 2. CUSTOM-ROLE ASSIGNMENT & PAYLOAD INTEGRITY ──────────────────────────
  await t.test('Custom-role assignment validation and payload integrity', async (st) => {

    await st.test('Valid custom role belonging to the same team succeeds', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.custom_role_id, CUSTOM_ROLE_VALID_ID);
    });

    await st.test('Custom role belonging to another team is rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_TEAM2_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Custom role does not belong to this workspace');
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });

    await st.test('Nonexistent custom role is rejected with 400', async () => {
      seedBaseline();
      const NONEXISTENT_ROLE_ID = '33333333-3333-4333-8333-333333333333';
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: NONEXISTENT_ROLE_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Custom role not found');
      assert.strictEqual(realtimeEvents.length, 0);
    });

    await st.test('Same-team custom role can be assigned regardless of display name without altering core membership role', async () => {
      seedBaseline();
      // Role with name "Administrator"
      const req1 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_ADMIN_NAMED_ID },
        user: { id: ADMIN_ID }
      };
      const { res: res1 } = await invoke(collaborationController.updateMemberCustomRole, req1);
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.body.custom_role_id, CUSTOM_ROLE_ADMIN_NAMED_ID);

      // Verify core role remains strictly 'member'
      const targetInDb1 = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      assert.strictEqual(targetInDb1.role, 'member', 'Core membership role must not change');
      assert.strictEqual(targetInDb1.custom_role_id, CUSTOM_ROLE_ADMIN_NAMED_ID);

      // Role with name "Staff Coordinator" & permissions: { manage_members: true }
      const req2 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_MANAGE_MEMBERS_ID },
        user: { id: ADMIN_ID }
      };
      const { res: res2 } = await invoke(collaborationController.updateMemberCustomRole, req2);
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.body.custom_role_id, CUSTOM_ROLE_MANAGE_MEMBERS_ID);

      const targetInDb2 = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      assert.strictEqual(targetInDb2.role, 'member', 'Core membership role must remain unescalated');
      assert.strictEqual(targetInDb2.custom_role_id, CUSTOM_ROLE_MANAGE_MEMBERS_ID);
    });

    await st.test('Attempted core-role escalation using role: "owner" is explicitly rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { role: 'owner', customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Core workspace roles cannot be mutated via custom role endpoint');

      // Verify database was NOT touched with owner role
      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      assert.strictEqual(targetInDb.role, 'member');
      assert.strictEqual(realtimeEvents.length, 0);
    });

    await st.test('Attempted core-role escalation using role: "admin" is explicitly rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { role: 'admin' },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Core workspace roles cannot be mutated via custom role endpoint');

      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      assert.strictEqual(targetInDb.role, 'member');
      assert.strictEqual(realtimeEvents.length, 0);
    });

    await st.test('Attempted core-role mutation using role: "member" is explicitly rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { role: 'member', customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Core workspace roles cannot be mutated via custom role endpoint');
      assert.strictEqual(realtimeEvents.length, 0);
    });

    await st.test('Empty body {} is rejected with 400 and performs no mutation or side effects', async () => {
      seedBaseline();
      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      targetInDb.custom_role_id = CUSTOM_ROLE_VALID_ID; // Pre-existing role

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: {},
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Missing required field: customRoleId');

      // Verify custom role was NOT cleared
      assert.strictEqual(targetInDb.custom_role_id, CUSTOM_ROLE_VALID_ID);
      assert.strictEqual(realtimeEvents.length, 0, 'No realtime event emitted on rejected empty body');
      assert.strictEqual(db.workspace_activities.length, 0, 'No activity logged on rejected empty body');
    });

    await st.test('Omitted customRoleId in request body is rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { someOtherField: 'value' },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });

    await st.test('Non-object or array request body is rejected with 400', async () => {
      seedBaseline();
      // Array body
      const req1 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: [CUSTOM_ROLE_VALID_ID],
        user: { id: ADMIN_ID }
      };
      const { res: res1 } = await invoke(collaborationController.updateMemberCustomRole, req1);
      assert.strictEqual(res1.statusCode, 400);
      assert.strictEqual(res1.body.error, 'Malformed request body');

      // Primitive string body
      const req2 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: 'just-a-string',
        user: { id: ADMIN_ID }
      };
      const { res: res2 } = await invoke(collaborationController.updateMemberCustomRole, req2);
      assert.strictEqual(res2.statusCode, 400);

      // null body
      const req3 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: null,
        user: { id: ADMIN_ID }
      };
      const { res: res3 } = await invoke(collaborationController.updateMemberCustomRole, req3);
      assert.strictEqual(res3.statusCode, 400);
    });

    await st.test('Unexpected fields in request body are rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID, unexpected_prop: 'malicious' },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Unexpected fields in request body'));
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });

    await st.test('Malformed IDs are rejected with 400', async () => {
      seedBaseline();
      // Malformed teamId
      const req1 = {
        params: { teamId: 'not-a-valid-uuid', userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res: res1 } = await invoke(collaborationController.updateMemberCustomRole, req1);
      assert.strictEqual(res1.statusCode, 400);

      // Malformed userId
      const req2 = {
        params: { teamId: TEAM_1_ID, userId: 'bad-user-id' },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res: res2 } = await invoke(collaborationController.updateMemberCustomRole, req2);
      assert.strictEqual(res2.statusCode, 400);

      // Malformed customRoleId
      const req3 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: 'invalid-role-uuid' },
        user: { id: ADMIN_ID }
      };
      const { res: res3 } = await invoke(collaborationController.updateMemberCustomRole, req3);
      assert.strictEqual(res3.statusCode, 400);
      assert.strictEqual(realtimeEvents.length, 0);
    });

    await st.test('Supported role-clearing request with explicit null clears custom_role_id (200)', async () => {
      seedBaseline();
      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      targetInDb.custom_role_id = CUSTOM_ROLE_VALID_ID;

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: null },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.custom_role_id, null);
      assert.strictEqual(targetInDb.custom_role_id, null);

      // Assert high-fidelity realtime payload with null custom_role_id
      assert.strictEqual(realtimeEvents.length, 1);
      const event = realtimeEvents[0];
      assert.strictEqual(event.type, 'to_room');
      assert.strictEqual(event.room, TEAM_1_ID);
      assert.strictEqual(event.event, 'member:role_updated');
      assert.deepStrictEqual(event.payload, {
        userId: TARGET_USER_ID,
        custom_role_id: null
      });
    });

    await st.test('Supported role-clearing request with explicit empty string clears custom_role_id (200)', async () => {
      seedBaseline();
      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      targetInDb.custom_role_id = CUSTOM_ROLE_VALID_ID;

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: '' },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.custom_role_id, null);
      assert.strictEqual(targetInDb.custom_role_id, null);
    });

    await st.test('Database validation query failure throws and propagates to next', async () => {
      seedBaseline();
      db.simulatedValidationQueryError = { message: 'DB disk IO failure on workspace_roles', code: '500' };
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.ok(nextErr, 'Must propagate error to next() on validation failure');
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });
  });

  // ── 3. DEPARTMENT ASSIGNMENT & FAILURE PATHS ───────────────────────────────
  await t.test('Department assignment validation, schema compliance and failure paths', async (st) => {

    await st.test('Valid active department succeeds (200) with proper query scoping', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.department_id, DEPT_ACTIVE_ID);

      // Verify query scoping
      const deptLookup = db.executedQueries.find(q => q.table === 'departments');
      assertQueryFilter(deptLookup, 'id', DEPT_ACTIVE_ID);

      const updateQuery = db.executedQueries.find(q => q.action === 'update');
      assertQueryFilter(updateQuery, 'team_id', TEAM_1_ID);
      assertQueryFilter(updateQuery, 'user_id', TARGET_USER_ID);
    });

    await st.test('Nonexistent department is rejected with 400', async () => {
      seedBaseline();
      const NONEXISTENT_DEPT_ID = '44444444-4444-4444-8444-444444444444';
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: NONEXISTENT_DEPT_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Department not found');
    });

    await st.test('Inactive department is rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_INACTIVE_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'Department is inactive or archived');
    });

    await st.test('Department assignment target membership missing returns 404', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: NON_MEMBER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.error, 'Target user is not a member of this team');
    });

    await st.test('Department assignment mutation returns zero rows (concurrent removal) returns 404', async () => {
      seedBaseline();
      const originalFrom = mockSupabase.from;
      try {
        mockSupabase.from = (table) => {
          const qb = originalFrom(table);
          if (table === 'team_members') {
            const originalUpdate = qb.update.bind(qb);
            qb.update = (payload) => {
              // Concurrently remove target member
              db.team_members = db.team_members.filter(m => m.user_id !== TARGET_USER_ID);
              return originalUpdate(payload);
            };
          }
          return qb;
        };

        const req = {
          params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
          body: { departmentId: DEPT_ACTIVE_ID },
          user: { id: ADMIN_ID }
        };
        const { res } = await invoke(collaborationController.updateMemberDepartment, req);
        assert.strictEqual(res.statusCode, 404);
        assert.ok(res.body.error.includes('zero rows'));
      } finally {
        mockSupabase.from = originalFrom;
      }
    });

    await st.test('Department assignment mutation query error propagates to next', async () => {
      seedBaseline();
      db.simulatedUpdateError = { message: 'Lock wait timeout on department update', code: '500' };

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.ok(nextErr, 'Mutation query error must propagate to next()');
    });

    await st.test('Department clearing request with null sets department_id to null (200)', async () => {
      seedBaseline();
      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      targetInDb.department_id = DEPT_ACTIVE_ID;

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: null },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.department_id, null);
      assert.strictEqual(targetInDb.department_id, null);
    });

    await st.test('Department clearing request with empty string sets department_id to null (200)', async () => {
      seedBaseline();
      const targetInDb = db.team_members.find(m => m.user_id === TARGET_USER_ID && m.team_id === TEAM_1_ID);
      targetInDb.department_id = DEPT_ACTIVE_ID;

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: '' },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.department_id, null);
      assert.strictEqual(targetInDb.department_id, null);
    });

    await st.test('Department assignment malformed IDs rejected with 400', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: 'malformed-dept-uuid' },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.strictEqual(res.statusCode, 400);
    });

    await st.test('Department database validation query failure throws and propagates to next', async () => {
      seedBaseline();
      db.simulatedValidationQueryError = { message: 'Database query timeout on departments', code: '500' };
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberDepartment, req);
      assert.ok(nextErr, 'Must fail closed and pass error to next()');
    });

    await st.test('Rejected department mutation emits zero success side effects', async () => {
      seedBaseline();
      // Rejected: ordinary member caller
      const req1 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: DEPT_ACTIVE_ID },
        user: { id: MEMBER_ID }
      };
      await invoke(collaborationController.updateMemberDepartment, req1);

      // Rejected: nonexistent department
      const req2 = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { departmentId: '44444444-4444-4444-8444-444444444444' },
        user: { id: ADMIN_ID }
      };
      await invoke(collaborationController.updateMemberDepartment, req2);

      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });
  });

  // ── 4. MUTATION INTEGRITY & REALTIME FIDELITY ──────────────────────────────
  await t.test('Mutation integrity, row verification and high-fidelity realtime emissions', async (st) => {

    await st.test('Custom role: target membership missing returns 404', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: NON_MEMBER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.error, 'Target user is not a member of this team');
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });

    await st.test('Custom role: target removed before mutation (zero rows affected) returns 404 with try/finally', async () => {
      seedBaseline();
      const originalFrom = mockSupabase.from;
      try {
        mockSupabase.from = (table) => {
          const qb = originalFrom(table);
          if (table === 'team_members') {
            const originalUpdate = qb.update.bind(qb);
            qb.update = (payload) => {
              // Concurrently remove target member
              db.team_members = db.team_members.filter(m => m.user_id !== TARGET_USER_ID);
              return originalUpdate(payload);
            };
          }
          return qb;
        };

        const req = {
          params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
          body: { customRoleId: CUSTOM_ROLE_VALID_ID },
          user: { id: ADMIN_ID }
        };
        const { res } = await invoke(collaborationController.updateMemberCustomRole, req);

        assert.strictEqual(res.statusCode, 404);
        assert.ok(res.body.error.includes('zero rows'));
        assert.strictEqual(realtimeEvents.length, 0, 'No realtime event emitted on zero rows updated');
        assert.strictEqual(db.workspace_activities.length, 0, 'No activity logged on zero rows updated');
      } finally {
        mockSupabase.from = originalFrom;
      }
    });

    await st.test('Custom role: mutation query failure propagates error and emits zero side effects', async () => {
      seedBaseline();
      db.simulatedUpdateError = { message: 'Lock wait timeout on team_members', code: '500' };

      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res, nextErr } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.ok(nextErr, 'Mutation query error must propagate to next()');
      assert.strictEqual(realtimeEvents.length, 0, 'No realtime event on failed mutation');
      assert.strictEqual(db.workspace_activities.length, 0, 'No activity log on failed mutation');
    });

    await st.test('Successful custom role mutation logs activity and emits realtime event with full 4-arg signature and payload', async () => {
      seedBaseline();
      const req = {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      };
      const { res } = await invoke(collaborationController.updateMemberCustomRole, req);
      assert.strictEqual(res.statusCode, 200);

      // Verify activity logging
      assert.strictEqual(db.workspace_activities.length, 1);
      const activity = db.workspace_activities[0];
      assert.strictEqual(activity.team_id, TEAM_1_ID);
      assert.strictEqual(activity.user_id, ADMIN_ID);
      assert.strictEqual(activity.activity_type, 'role_changed');
      assert.strictEqual(activity.entity_id, TARGET_USER_ID);

      // Verify full 4-argument realtime signature and payload fidelity
      assert.strictEqual(realtimeEvents.length, 1);
      const event = realtimeEvents[0];
      assert.strictEqual(event.type, 'to_room', 'Argument 1: type must be to_room');
      assert.strictEqual(event.room, TEAM_1_ID, 'Argument 2: room must be teamId');
      assert.strictEqual(event.event, 'member:role_updated', 'Argument 3: event must be member:role_updated');
      assert.deepStrictEqual(event.payload, {
        userId: TARGET_USER_ID,
        custom_role_id: CUSTOM_ROLE_VALID_ID
      }, 'Argument 4: payload must contain userId and custom_role_id');
    });

    await st.test('Rejected mutations emit no realtime event and create no activity record across all failure modes', async () => {
      seedBaseline();
      // Failure mode 1: Cross-team role
      await invoke(collaborationController.updateMemberCustomRole, {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_TEAM2_ID },
        user: { id: ADMIN_ID }
      });

      // Failure mode 2: Core role escalation
      await invoke(collaborationController.updateMemberCustomRole, {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { role: 'owner', customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      });

      // Failure mode 3: Unauthorized ordinary member
      await invoke(collaborationController.updateMemberCustomRole, {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: MEMBER_ID }
      });

      // Failure mode 4: Empty body {}
      await invoke(collaborationController.updateMemberCustomRole, {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: {},
        user: { id: ADMIN_ID }
      });

      // Failure mode 5: Malformed UUID
      await invoke(collaborationController.updateMemberCustomRole, {
        params: { teamId: 'bad-uuid', userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      });

      assert.strictEqual(realtimeEvents.length, 0, 'Must have zero realtime events across all rejected attempts');
      assert.strictEqual(db.workspace_activities.length, 0, 'Must have zero activity records across all rejected attempts');
    });
  });

  // ── 6. ANNOUNCEMENT ENDPOINT AUTHORIZATION (PHASE 2.0U.6A) ─────────────────
  await t.test('Announcement endpoints: team-scoped authorization, validation and realtime isolation', async (st) => {
    const TEAM_MIXED_ID = 'abcdef12-abcd-4abc-8abc-abcdef123456';
    const VALID_BODY = { title: 'Maintenance', content: 'Window tonight', priority: 'high', audience: 'team' };

    // NOTE: rest args (not default params) so an explicit `undefined` team ID is passed through as-is.
    const post = (userId, body, ...rest) =>
      invoke(collaborationController.createAnnouncement, {
        params: { teamId: rest.length ? rest[0] : TEAM_1_ID },
        body,
        user: userId ? { id: userId } : undefined
      });
    const get = (userId, ...rest) =>
      invoke(collaborationController.getAnnouncements, {
        params: { teamId: rest.length ? rest[0] : TEAM_1_ID },
        user: userId ? { id: userId } : undefined
      });

    const annQueries = () => db.executedQueries.filter((q) => q.table === 'announcements');
    const assertNoSideEffects = (msg = '') => {
      assert.strictEqual(db.announcements.length, 0, `No announcement persisted ${msg}`);
      assert.strictEqual(annQueries().length, 0, `No announcements-table query ${msg}`);
      assert.strictEqual(realtimeEvents.length, 0, `No realtime event ${msg}`);
      assert.strictEqual(db.workspace_activities.length, 0, `No activity log ${msg}`);
    };

    // ── Creation: authentication & membership ──
    await st.test('Create: unauthenticated requester gets 401 with zero queries and side effects', async () => {
      seedBaseline();
      const { res } = await post(undefined, VALID_BODY);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
      assert.strictEqual(db.executedQueries.length, 0);
      assertNoSideEffects();
    });

    await st.test('Create: authenticated non-member gets 403 NOT_TEAM_MEMBER', async () => {
      seedBaseline();
      const { res, nextErr } = await post(NON_MEMBER_ID, VALID_BODY);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
      assertNoSideEffects();
    });

    await st.test('Create: Team A admin/member targeting Team B gets 403 NOT_TEAM_MEMBER', async () => {
      seedBaseline();
      for (const userId of [ADMIN_ID, MEMBER_ID]) {
        const { res } = await post(userId, VALID_BODY, TEAM_2_ID);
        assert.strictEqual(res.statusCode, 403, `user ${userId} must not post into Team B`);
        assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
      }
      assertNoSideEffects();
    });

    await st.test('Create: ordinary member gets 403 INSUFFICIENT_PERMISSIONS', async () => {
      seedBaseline();
      const { res, nextErr } = await post(MEMBER_ID, VALID_BODY);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'INSUFFICIENT_PERMISSIONS');
      assertNoSideEffects();
    });

    await st.test('Create: custom role named/permissioned like admin does not grant creation rights', async () => {
      seedBaseline();
      db.team_members.find((m) => m.user_id === MEMBER_ID).custom_role_id = CUSTOM_ROLE_ADMIN_NAMED_ID;
      db.team_members.find((m) => m.user_id === TARGET_USER_ID).custom_role_id = CUSTOM_ROLE_MANAGE_MEMBERS_ID;
      for (const userId of [MEMBER_ID, TARGET_USER_ID]) {
        const { res } = await post(userId, VALID_BODY);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.code, 'INSUFFICIENT_PERMISSIONS');
      }
      assertNoSideEffects();
    });

    await st.test('Create: client-supplied role fields cannot elevate an ordinary member', async () => {
      seedBaseline();
      const { res } = await post(MEMBER_ID, { ...VALID_BODY, role: 'admin' });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'INSUFFICIENT_PERMISSIONS');
      const req = { params: { teamId: TEAM_1_ID }, body: VALID_BODY, user: { id: MEMBER_ID, role: 'admin' } };
      const second = await invoke(collaborationController.createAnnouncement, req);
      assert.strictEqual(second.res.statusCode, 403, 'req.user.role must not be used as authorization evidence');
      assertNoSideEffects();
    });

    await st.test('Create: owner succeeds (201) and persists to own team', async () => {
      seedBaseline();
      const { res, nextErr } = await post(OWNER_ID, VALID_BODY);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(db.announcements.length, 1);
      assert.strictEqual(db.announcements[0].team_id, TEAM_1_ID);
      assert.strictEqual(res.body.id, db.announcements[0].id);
    });

    await st.test('Create: admin succeeds (201) and persists to own team', async () => {
      seedBaseline();
      const { res, nextErr } = await post(ADMIN_ID, VALID_BODY);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(db.announcements.length, 1);
      assert.strictEqual(db.announcements[0].team_id, TEAM_1_ID);
    });

    await st.test('Create: admin of Team A cannot post to Team B even though an owner of both teams can post to each', async () => {
      seedBaseline();
      const denied = await post(ADMIN_ID, VALID_BODY, TEAM_2_ID);
      assert.strictEqual(denied.res.statusCode, 403);
      assert.strictEqual(db.announcements.length, 0);
      const allowed = await post(OWNER_ID, VALID_BODY, TEAM_2_ID);
      assert.strictEqual(allowed.res.statusCode, 201);
      assert.strictEqual(db.announcements.length, 1);
      assert.strictEqual(db.announcements[0].team_id, TEAM_2_ID);
    });

    await st.test('Create: membership query errors fail closed through next(err)', async () => {
      seedBaseline();
      const viaUser = await post(AUTH_QUERY_FAIL_USER_ID, VALID_BODY);
      assert.ok(viaUser.nextErr, 'error must be forwarded to next');
      assert.strictEqual(viaUser.res.body, null, 'no response body on error path');
      assertNoSideEffects('(per-user failure)');

      seedBaseline();
      db.simulatedAuthError = { message: 'team_members unavailable', code: '500' };
      const viaGlobal = await post(OWNER_ID, VALID_BODY);
      assert.ok(viaGlobal.nextErr);
      assert.strictEqual(viaGlobal.res.body, null);
      assertNoSideEffects('(global team_members failure)');
    });

    await st.test('Create: membership lookup is scoped by BOTH team_id and requester user_id', async () => {
      seedBaseline();
      await post(OWNER_ID, VALID_BODY);
      const membershipQueries = db.executedQueries.filter((q) => q.table === 'team_members');
      assert.strictEqual(membershipQueries.length, 1);
      assertQueryFilter(membershipQueries[0], 'team_id', TEAM_1_ID);
      assertQueryFilter(membershipQueries[0], 'user_id', OWNER_ID);
      assert.strictEqual(membershipQueries[0].action, 'select');
    });

    // ── Team ID validation (create + retrieve) ──
    await st.test('Invalid team IDs (malformed, "null", "undefined", empty, missing, injection) return 400 with zero DB activity', async () => {
      const badIds = [
        'not-a-uuid', 'null', 'undefined', '', undefined, null, 12345,
        '11111111-1111-4111-8111-11111111111',
        '11111111-1111-4111-8111-1111111111111',
        'gggggggg-1111-4111-8111-111111111111',
        `${TEAM_1_ID}' OR '1'='1`,
        `${TEAM_1_ID},${TEAM_2_ID}`
      ];
      for (const badId of badIds) {
        seedBaseline();
        const created = await post(OWNER_ID, VALID_BODY, badId);
        assert.strictEqual(created.res.statusCode, 400, `create with ${JSON.stringify(badId)}`);
        assert.strictEqual(created.res.body.code, 'INVALID_TEAM_ID');
        assert.strictEqual(db.executedQueries.length, 0, `no DB query on create for ${JSON.stringify(badId)}`);
        assertNoSideEffects(`(create ${JSON.stringify(badId)})`);

        const fetched = await get(OWNER_ID, badId);
        assert.strictEqual(fetched.res.statusCode, 400, `get with ${JSON.stringify(badId)}`);
        assert.strictEqual(fetched.res.body.code, 'INVALID_TEAM_ID');
        assert.strictEqual(db.executedQueries.length, 0, `no DB query on get for ${JSON.stringify(badId)}`);
      }
    });

    await st.test('Create: missing params object entirely is rejected with 400 (no throw)', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.createAnnouncement, {
        body: VALID_BODY,
        user: { id: OWNER_ID }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'INVALID_TEAM_ID');
      assert.strictEqual(db.executedQueries.length, 0);
    });

    // ── Payload validation ──
    await st.test('Create: invalid payloads are rejected with 400 and no persistence or side effects', async () => {
      const longTitle = 'x'.repeat(256);
      const cases = [
        ['missing title', { content: 'c' }],
        ['empty title', { title: '', content: 'c' }],
        ['whitespace title', { title: '   ', content: 'c' }],
        ['non-string title', { title: 123, content: 'c' }],
        ['over-length title', { title: longTitle, content: 'c' }],
        ['missing content', { title: 't' }],
        ['empty content', { title: 't', content: '' }],
        ['whitespace content', { title: 't', content: '  \n ' }],
        ['non-string content', { title: 't', content: { a: 1 } }],
        ['invalid priority', { title: 't', content: 'c', priority: 'critical' }],
        ['null priority', { title: 't', content: 'c', priority: null }],
        ['invalid audience', { title: 't', content: 'c', audience: 'everyone' }],
        ['global audience', { title: 't', content: 'c', audience: 'global' }],
        ['null audience', { title: 't', content: 'c', audience: null }],
        ['invalid scheduled_at', { title: 't', content: 'c', scheduled_at: 'not-a-date' }],
        ['non-string scheduled_at', { title: 't', content: 'c', scheduled_at: 12345 }],
        ['null body', null],
        ['array body', [VALID_BODY]],
        ['string body', 'title=x'],
        ['undefined body', undefined]
      ];
      for (const [label, body] of cases) {
        seedBaseline();
        const { res, nextErr } = await post(OWNER_ID, body);
        assert.strictEqual(nextErr, null, label);
        assert.strictEqual(res.statusCode, 400, label);
        assert.strictEqual(res.body.code, 'INVALID_ANNOUNCEMENT_PAYLOAD', label);
        assert.strictEqual(db.announcements.length, 0, `${label}: nothing persisted`);
        assert.strictEqual(realtimeEvents.length, 0, `${label}: no realtime`);
        assert.strictEqual(db.workspace_activities.length, 0, `${label}: no activity`);
        assert.strictEqual(annQueries().length, 0, `${label}: announcements table untouched`);
      }
    });

    await st.test('Create: unsupported request fields (incl. team/room overrides) are rejected with 400', async () => {
      const extras = [
        { team_id: TEAM_2_ID }, { teamId: TEAM_2_ID }, { room: 'global' },
        { role: 'owner' }, { id: 'forced-id' }, { created_by: OWNER_ID }, { unknown: true }
      ];
      for (const extra of extras) {
        seedBaseline();
        const { res } = await post(OWNER_ID, { ...VALID_BODY, ...extra });
        assert.strictEqual(res.statusCode, 400, JSON.stringify(extra));
        assert.strictEqual(res.body.code, 'INVALID_ANNOUNCEMENT_PAYLOAD');
        assertNoSideEffects(JSON.stringify(extra));
      }
    });

    await st.test('Create: authorization failure takes precedence over payload errors (no validation oracle for non-members)', async () => {
      seedBaseline();
      const nonMember = await post(NON_MEMBER_ID, { bogus: true });
      assert.strictEqual(nonMember.res.statusCode, 403);
      assert.strictEqual(nonMember.res.body.code, 'NOT_TEAM_MEMBER');
      const member = await post(MEMBER_ID, { bogus: true });
      assert.strictEqual(member.res.statusCode, 403);
      assert.strictEqual(member.res.body.code, 'INSUFFICIENT_PERMISSIONS');
    });

    await st.test('Create: defaults (priority normal, audience all) apply only when fields are omitted; text is trimmed', async () => {
      seedBaseline();
      const { res } = await post(OWNER_ID, { title: '  Hello  ', content: '  World  ' });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(db.announcements[0].title, 'Hello');
      assert.strictEqual(db.announcements[0].content, 'World');
      assert.strictEqual(db.announcements[0].priority, 'normal');
      assert.strictEqual(db.announcements[0].audience, 'all');
      assert.ok(!Number.isNaN(new Date(db.announcements[0].scheduled_at).getTime()));
    });

    await st.test('Create: every priority and audience value in the schema contract is accepted', async () => {
      for (const priority of ['low', 'normal', 'high', 'urgent']) {
        for (const audience of ['all', 'business', 'team']) {
          seedBaseline();
          const { res } = await post(OWNER_ID, { title: 't', content: 'c', priority, audience });
          assert.strictEqual(res.statusCode, 201, `${priority}/${audience}`);
          assert.strictEqual(db.announcements[0].priority, priority);
          assert.strictEqual(db.announcements[0].audience, audience);
        }
      }
    });

    await st.test('Create: a valid scheduled_at is preserved', async () => {
      seedBaseline();
      const when = '2030-01-02T03:04:05.000Z';
      const { res } = await post(OWNER_ID, { ...VALID_BODY, scheduled_at: when });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(db.announcements[0].scheduled_at, when);
    });

    // ── Persistence & realtime integrity ──
    await st.test('Create: persisted team_id is always the validated route team (never null, never body-supplied)', async () => {
      seedBaseline();
      await post(OWNER_ID, VALID_BODY, TEAM_1_ID);
      await post(OWNER_ID, VALID_BODY, TEAM_2_ID);
      await post(OWNER_ID, { ...VALID_BODY, team_id: TEAM_2_ID }, TEAM_1_ID); // rejected, must not persist
      assert.strictEqual(db.announcements.length, 2);
      assert.deepStrictEqual(db.announcements.map((a) => a.team_id), [TEAM_1_ID, TEAM_2_ID]);
      assert.ok(db.announcements.every((a) => typeof a.team_id === 'string' && a.team_id.length === 36), 'no null/undefined team_id');
    });

    await st.test('Create: success emits exactly one announcement:created event to the validated team room only', async () => {
      seedBaseline();
      const { res } = await post(ADMIN_ID, VALID_BODY);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(realtimeEvents.length, 1);
      const evt = realtimeEvents[0];
      assert.strictEqual(evt.type, 'to_room');
      assert.strictEqual(evt.room, TEAM_1_ID);
      assert.strictEqual(evt.event, 'announcement:created');
      assert.deepStrictEqual(evt.payload, db.announcements[0], 'payload contract preserved (the persisted row)');
      assert.ok(!realtimeEvents.some((e) => ['global', null, undefined, ''].includes(e.room)), 'no global/null/empty room');
    });

    await st.test('Create: success writes one announcement_posted activity for the verified team and requester', async () => {
      seedBaseline();
      await post(OWNER_ID, VALID_BODY);
      assert.strictEqual(db.workspace_activities.length, 1);
      const act = db.workspace_activities[0];
      assert.strictEqual(act.team_id, TEAM_1_ID);
      assert.strictEqual(act.user_id, OWNER_ID);
      assert.strictEqual(act.activity_type, 'announcement_posted');
      assert.strictEqual(act.entity_id, db.announcements[0].id);
    });

    await st.test('Create: UUID casing is canonicalised so persisted team_id and realtime room match the lowercase room', async () => {
      seedBaseline();
      db.team_members.push({ team_id: TEAM_MIXED_ID, user_id: OWNER_ID, role: 'owner', custom_role_id: null, department_id: null });
      const { res } = await post(OWNER_ID, VALID_BODY, TEAM_MIXED_ID.toUpperCase());
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(db.announcements[0].team_id, TEAM_MIXED_ID);
      assert.strictEqual(realtimeEvents[0].room, TEAM_MIXED_ID);
      assert.strictEqual(db.workspace_activities[0].team_id, TEAM_MIXED_ID);
    });

    await st.test('Create: persistence error yields no success realtime event, no activity log, and is forwarded to next(err)', async () => {
      seedBaseline();
      db.simulatedAnnouncementInsertError = { message: 'insert failed', code: '23503' };
      const { res, nextErr } = await post(OWNER_ID, VALID_BODY);
      assert.ok(nextErr, 'error forwarded to next');
      assert.strictEqual(res.body, null, 'no success body');
      assert.strictEqual(db.announcements.length, 0);
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
    });

    await st.test('Create: no rejected request of any kind produces realtime events or activity logs', async () => {
      seedBaseline();
      await post(undefined, VALID_BODY);
      await post(NON_MEMBER_ID, VALID_BODY);
      await post(MEMBER_ID, VALID_BODY);
      await post(ADMIN_ID, VALID_BODY, TEAM_2_ID);
      await post(OWNER_ID, VALID_BODY, 'null');
      await post(OWNER_ID, { title: '' });
      await post(OWNER_ID, { ...VALID_BODY, team_id: TEAM_2_ID });
      assert.strictEqual(realtimeEvents.length, 0);
      assert.strictEqual(db.workspace_activities.length, 0);
      assert.strictEqual(db.announcements.length, 0);
    });

    // ── Retrieval isolation ──
    const seedAnnouncements = () => {
      db.announcements = [
        { id: 'ann-t1-a', team_id: TEAM_1_ID, title: 'T1 A', content: 'c', priority: 'normal', audience: 'all', scheduled_at: '2030-01-01T00:00:00Z' },
        { id: 'ann-t1-b', team_id: TEAM_1_ID, title: 'T1 B', content: 'c', priority: 'high', audience: 'team', scheduled_at: '2030-01-02T00:00:00Z' },
        { id: 'ann-t2-a', team_id: TEAM_2_ID, title: 'T2 A', content: 'secret', priority: 'urgent', audience: 'team', scheduled_at: '2030-01-03T00:00:00Z' },
        { id: 'ann-org', team_id: null, title: 'Legacy org-wide', content: 'c', priority: 'normal', audience: 'all', scheduled_at: '2030-01-04T00:00:00Z' }
      ];
    };

    await st.test('Retrieve: unauthenticated requester gets 401 with zero queries', async () => {
      seedBaseline();
      seedAnnouncements();
      const { res } = await get(undefined);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
      assert.strictEqual(db.executedQueries.length, 0);
    });

    await st.test('Retrieve: authenticated non-member gets 403 NOT_TEAM_MEMBER and announcements are never queried', async () => {
      seedBaseline();
      seedAnnouncements();
      const { res } = await get(NON_MEMBER_ID);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
      assert.strictEqual(annQueries().length, 0);
      assert.ok(!JSON.stringify(res.body).includes('T1'), 'no announcement data leaked');
    });

    await st.test('Retrieve: Team A member cannot retrieve Team B announcements', async () => {
      seedBaseline();
      seedAnnouncements();
      for (const userId of [ADMIN_ID, MEMBER_ID]) {
        const { res } = await get(userId, TEAM_2_ID);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
        assert.ok(!JSON.stringify(res.body).includes('secret'));
      }
      assert.strictEqual(annQueries().length, 0);
    });

    await st.test('Retrieve: ordinary member reads only their own team announcements (no other team, no org-wide rows)', async () => {
      seedBaseline();
      seedAnnouncements();
      const { res, nextErr } = await get(MEMBER_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body.map((a) => a.id).sort(), ['ann-t1-a', 'ann-t1-b']);
      assert.ok(res.body.every((a) => a.team_id === TEAM_1_ID));
      const q = annQueries();
      assert.strictEqual(q.length, 1);
      assertQueryFilter(q[0], 'team_id', TEAM_1_ID);
    });

    await st.test('Retrieve: multi-team owner receives only the requested team rows', async () => {
      seedBaseline();
      seedAnnouncements();
      const t2 = await get(OWNER_ID, TEAM_2_ID);
      assert.strictEqual(t2.res.statusCode, 200);
      assert.deepStrictEqual(t2.res.body.map((a) => a.id), ['ann-t2-a']);
      const t1 = await get(OWNER_ID, TEAM_1_ID);
      assert.deepStrictEqual(t1.res.body.map((a) => a.id).sort(), ['ann-t1-a', 'ann-t1-b']);
    });

    await st.test('Retrieve: membership lookup is scoped by BOTH team_id and requester user_id', async () => {
      seedBaseline();
      seedAnnouncements();
      await get(MEMBER_ID);
      const membershipQueries = db.executedQueries.filter((q) => q.table === 'team_members');
      assert.strictEqual(membershipQueries.length, 1);
      assertQueryFilter(membershipQueries[0], 'team_id', TEAM_1_ID);
      assertQueryFilter(membershipQueries[0], 'user_id', MEMBER_ID);
    });

    await st.test('Retrieve: membership query errors fail closed and return no announcement data', async () => {
      seedBaseline();
      seedAnnouncements();
      const viaUser = await get(AUTH_QUERY_FAIL_USER_ID);
      assert.ok(viaUser.nextErr);
      assert.strictEqual(viaUser.res.body, null);
      assert.strictEqual(annQueries().length, 0);

      seedBaseline();
      seedAnnouncements();
      db.simulatedAuthError = { message: 'team_members unavailable', code: '500' };
      const viaGlobal = await get(OWNER_ID);
      assert.ok(viaGlobal.nextErr);
      assert.strictEqual(viaGlobal.res.body, null);
      assert.strictEqual(annQueries().length, 0);
    });

    await st.test('Retrieve: empty team returns an empty array (response shape preserved)', async () => {
      seedBaseline();
      const { res } = await get(OWNER_ID);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, []);
    });
  });

  // ── 7. ANNOUNCEMENT AUDIENCE VISIBILITY ENFORCEMENT (PHASE 2.0U.6C.1) ──────
  await t.test('Announcement audience enforcement: REST query-layer filtering, realtime containment, and activity-feed non-disclosure', async (st) => {
    const post = (userId, body, teamId = TEAM_1_ID) =>
      invoke(collaborationController.createAnnouncement, {
        params: { teamId },
        body,
        user: userId ? { id: userId } : undefined
      });
    const get = (userId, teamId = TEAM_1_ID, extraReq = {}) =>
      invoke(collaborationController.getAnnouncements, {
        params: { teamId },
        user: userId ? { id: userId } : undefined,
        ...extraReq
      });
    const getActivities = (userId, teamId = TEAM_1_ID) =>
      invoke(collaborationController.getWorkspaceActivities, {
        params: { teamId },
        user: userId ? { id: userId } : undefined
      });

    const seedMixedAudienceAnnouncements = () => {
      db.announcements = [
        {
          id: 'ann-all-1',
          team_id: TEAM_1_ID,
          title: 'Public All-Hands',
          content: 'Visible to everyone in team 1',
          priority: 'normal',
          audience: 'all',
          scheduled_at: '2030-02-01T00:00:00.000Z'
        },
        {
          id: 'ann-team-1',
          team_id: TEAM_1_ID,
          title: 'Team Sprint Notice',
          content: 'Visible to team 1 members',
          priority: 'high',
          audience: 'team',
          scheduled_at: '2030-02-02T00:00:00.000Z'
        },
        {
          id: 'ann-biz-1',
          team_id: TEAM_1_ID,
          title: 'CONFIDENTIAL M&A Board Memo',
          content: 'Restricted to workspace owners and admins only',
          priority: 'urgent',
          audience: 'business',
          scheduled_at: '2030-02-03T00:00:00.000Z'
        },
        {
          id: 'ann-t2-biz',
          team_id: TEAM_2_ID,
          title: 'Team 2 Confidential',
          content: 'Foreign team business announcement',
          priority: 'urgent',
          audience: 'business',
          scheduled_at: '2030-02-04T00:00:00.000Z'
        }
      ];
    };

    // ── REST retrieval enforcement ──
    await st.test('REST: Owner retrieves all, team, and business announcements for their team', async () => {
      seedBaseline();
      seedMixedAudienceAnnouncements();
      const { res, nextErr } = await get(OWNER_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body.map((a) => a.id).sort(), ['ann-all-1', 'ann-biz-1', 'ann-team-1']);
      assert.deepStrictEqual(res.body.map((a) => a.audience).sort(), ['all', 'business', 'team']);
      const annQuery = db.executedQueries.find((q) => q.table === 'announcements');
      assert.ok(annQuery, 'announcements query executed');
      assertQueryFilter(annQuery, 'team_id', TEAM_1_ID);
      const inFilter = annQuery.filters.find((f) => f.col === 'audience' && f.op === 'in');
      assert.strictEqual(inFilter, undefined, 'owner query must not restrict supported audiences');
    });

    await st.test('REST: Admin retrieves all, team, and business announcements for their team', async () => {
      seedBaseline();
      seedMixedAudienceAnnouncements();
      const { res, nextErr } = await get(ADMIN_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body.map((a) => a.id).sort(), ['ann-all-1', 'ann-biz-1', 'ann-team-1']);
      assert.deepStrictEqual(res.body.map((a) => a.audience).sort(), ['all', 'business', 'team']);
      const annQuery = db.executedQueries.find((q) => q.table === 'announcements');
      assert.ok(annQuery);
      assertQueryFilter(annQuery, 'team_id', TEAM_1_ID);
      const inFilter = annQuery.filters.find((f) => f.col === 'audience' && f.op === 'in');
      assert.strictEqual(inFilter, undefined, 'admin query must not restrict supported audiences');
    });

    await st.test('REST: Ordinary member receives ONLY all and team announcements (zero business metadata leaked)', async () => {
      seedBaseline();
      seedMixedAudienceAnnouncements();
      const { res, nextErr } = await get(MEMBER_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body.map((a) => a.id).sort(), ['ann-all-1', 'ann-team-1']);
      assert.ok(res.body.every((a) => a.audience === 'all' || a.audience === 'team'));
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes('ann-biz-1'), 'business announcement ID must not leak');
      assert.ok(!serialized.includes('CONFIDENTIAL M&A Board Memo'), 'business announcement title must not leak');
      assert.ok(!serialized.includes('Restricted to workspace owners and admins only'), 'business announcement content must not leak');
      assert.ok(!serialized.includes('2030-02-03T00:00:00.000Z'), 'business announcement schedule must not leak');
    });

    await st.test('REST: Ordinary member query applies audience IN (all, team) restriction at the database-query layer', async () => {
      seedBaseline();
      seedMixedAudienceAnnouncements();
      await get(MEMBER_ID);
      const annQueries = db.executedQueries.filter((q) => q.table === 'announcements');
      assert.strictEqual(annQueries.length, 1);
      assertQueryFilter(annQueries[0], 'team_id', TEAM_1_ID);
      const inFilter = annQueries[0].filters.find((f) => f.col === 'audience' && f.op === 'in');
      assert.ok(inFilter, 'database query must include an IN filter on column audience');
      assert.deepStrictEqual([...inFilter.val].sort(), ['all', 'team']);
      assert.ok(!inFilter.val.includes('business'), 'business audience must be excluded at the query layer');
    });

    await st.test('REST: Custom workspace roles, client-supplied roles, and query params cannot bypass member audience filter', async () => {
      seedBaseline();
      seedMixedAudienceAnnouncements();
      db.team_members.find((m) => m.user_id === MEMBER_ID).custom_role_id = CUSTOM_ROLE_ADMIN_NAMED_ID;
      db.team_members.find((m) => m.user_id === TARGET_USER_ID).custom_role_id = CUSTOM_ROLE_MANAGE_MEMBERS_ID;

      for (const uid of [MEMBER_ID, TARGET_USER_ID]) {
        const { res } = await invoke(collaborationController.getAnnouncements, {
          params: { teamId: TEAM_1_ID },
          user: { id: uid, role: 'owner', subscription_tier: 'business' },
          query: { audience: 'business', role: 'owner' },
          body: { role: 'owner', audience: 'business' }
        });
        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body.map((a) => a.id).sort(), ['ann-all-1', 'ann-team-1']);
        assert.ok(!JSON.stringify(res.body).includes('ann-biz-1'));
      }
    });

    await st.test('REST: Membership lookup failure fails closed and invalid team IDs remain rejected with 400', async () => {
      seedBaseline();
      seedMixedAudienceAnnouncements();
      const failed = await get(AUTH_QUERY_FAIL_USER_ID);
      assert.ok(failed.nextErr, 'membership lookup error must fail closed via next(err)');
      assert.strictEqual(failed.res.body, null);
      assert.strictEqual(db.executedQueries.filter((q) => q.table === 'announcements').length, 0);

      for (const badId of ['null', 'undefined', 'not-a-uuid', '']) {
        seedBaseline();
        seedMixedAudienceAnnouncements();
        const invalidRes = await get(OWNER_ID, badId);
        assert.strictEqual(invalidRes.res.statusCode, 400);
        assert.strictEqual(invalidRes.res.body.code, 'INVALID_TEAM_ID');
        assert.strictEqual(db.executedQueries.length, 0);
      }
    });

    // ── Realtime disclosure enforcement ──
    await st.test('Realtime: all and team announcements retain shared-room emission to validated teamId', async () => {
      for (const audience of ['all', 'team']) {
        seedBaseline();
        const { res } = await post(OWNER_ID, {
          title: `Notice (${audience})`,
          content: 'Shared notice',
          priority: 'normal',
          audience
        });
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(realtimeEvents.length, 1, `expected 1 realtime event for audience=${audience}`);
        assert.strictEqual(realtimeEvents[0].type, 'to_room');
        assert.strictEqual(realtimeEvents[0].room, TEAM_1_ID);
        assert.strictEqual(realtimeEvents[0].event, 'announcement:created');
        assert.strictEqual(realtimeEvents[0].payload.audience, audience);
      }
    });

    await st.test('Realtime: business announcement suppresses shared-room emission and leaks zero fallback events or metadata', async () => {
      seedBaseline();
      const secretBody = {
        title: 'Exec Compensation Review',
        content: 'Q4 executive bonus pool details',
        priority: 'urgent',
        audience: 'business',
        scheduled_at: '2030-03-15T12:00:00.000Z'
      };
      const { res, nextErr } = await post(ADMIN_ID, secretBody);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(db.announcements.length, 1);
      assert.strictEqual(db.announcements[0].audience, 'business');

      // Explicit assertion of realtime suppression: zero events to team room, global room, or any fallback channel
      assert.strictEqual(realtimeEvents.length, 0, 'realtime emission must be suppressed for business audience');
    });

    // ── Activity-feed metadata disclosure enforcement ──
    await st.test('Activity feed: business announcement suppresses announcement_posted activity so ordinary members cannot obtain its title or ID', async () => {
      seedBaseline();
      const bizTitle = 'Board Restructuring Plan';
      const createdBiz = await post(OWNER_ID, {
        title: bizTitle,
        content: 'Confidential restructuring steps',
        priority: 'urgent',
        audience: 'business'
      });
      assert.strictEqual(createdBiz.res.statusCode, 201);
      const bizId = createdBiz.res.body.id;

      // No activity entry created for business announcement
      assert.strictEqual(db.workspace_activities.length, 0, 'business announcement must not log to shared workspace_activities');

      // Ordinary member retrieving workspace activities receives zero business metadata
      const actRes = await getActivities(MEMBER_ID);
      assert.strictEqual(actRes.res.statusCode, 200);
      const serialized = JSON.stringify(actRes.res.body);
      assert.ok(!serialized.includes(bizTitle), 'activity feed must not leak business announcement title');
      assert.ok(!serialized.includes(bizId), 'activity feed must not leak business announcement ID');

      // Meanwhile, owners and admins retain full intended access to the business announcement via getAnnouncements
      const ownerGet = await get(OWNER_ID);
      assert.strictEqual(ownerGet.res.statusCode, 200);
      assert.strictEqual(ownerGet.res.body.length, 1);
      assert.strictEqual(ownerGet.res.body[0].id, bizId);
      assert.strictEqual(ownerGet.res.body[0].title, bizTitle);

      const adminGet = await get(ADMIN_ID);
      assert.strictEqual(adminGet.res.statusCode, 200);
      assert.strictEqual(adminGet.res.body.length, 1);
      assert.strictEqual(adminGet.res.body[0].id, bizId);
    });

    await st.test('Activity feed: unrelated activities and all/team announcement activities remain available under existing rules', async () => {
      seedBaseline();
      // 1. Unrelated activity (custom role update)
      await invoke(collaborationController.updateMemberCustomRole, {
        params: { teamId: TEAM_1_ID, userId: TARGET_USER_ID },
        body: { customRoleId: CUSTOM_ROLE_VALID_ID },
        user: { id: ADMIN_ID }
      });
      // 2. Non-restricted announcements ('all' and 'team')
      await post(OWNER_ID, { title: 'General Bulletin', content: 'For all', priority: 'normal', audience: 'all' });
      await post(ADMIN_ID, { title: 'Team Sync Note', content: 'For team', priority: 'low', audience: 'team' });
      // 3. Restricted announcement ('business')
      const biz = await post(OWNER_ID, { title: 'Secret Admin Note', content: 'Admins only', priority: 'urgent', audience: 'business' });

      assert.strictEqual(db.workspace_activities.length, 3, 'only role_changed + 2 non-business announcements logged');
      const actRes = await getActivities(MEMBER_ID);
      assert.strictEqual(actRes.res.statusCode, 200);
      assert.strictEqual(actRes.res.body.length, 3);
      assert.deepStrictEqual(
        actRes.res.body.map((a) => a.activity_type),
        ['role_changed', 'announcement_posted', 'announcement_posted']
      );
      const serialized = JSON.stringify(actRes.res.body);
      assert.ok(serialized.includes('General Bulletin'));
      assert.ok(serialized.includes('Team Sync Note'));
      assert.ok(!serialized.includes('Secret Admin Note'));
      assert.ok(!serialized.includes(biz.res.body.id));
    });
  });

  // ── 5. RETIRED WORKSPACE WEBHOOK SECRET ENDPOINTS (PHASE 2.0U.5A) ──────────
  await t.test('Retired workspace webhook secret endpoints return 410 Gone and disclose zero secrets', async (st) => {
    const teamController = require('../controllers/teamController');
    const crypto = require('crypto');
    const Module = require('module');

    await st.test('collaborationController.getWebhookSecret returns HTTP 410 with WORKSPACE_WEBHOOKS_UNAVAILABLE', async () => {
      seedBaseline();
      const req = { params: { teamId: TEAM_1_ID }, user: { id: ADMIN_ID } };
      const { res } = await invoke(collaborationController.getWebhookSecret, req);

      assert.strictEqual(res.statusCode, 410);
      assert.deepStrictEqual(res.body, {
        success: false,
        code: 'WORKSPACE_WEBHOOKS_UNAVAILABLE',
        message: 'Workspace webhook integrations are not currently available.'
      });
      assert.strictEqual(db.executedQueries.length, 0, 'No database query on retired endpoint');
      assert.strictEqual(realtimeEvents.length, 0, 'No realtime events on retired endpoint');
    });

    await st.test('teamController.getWebhookSecret returns HTTP 410 with WORKSPACE_WEBHOOKS_UNAVAILABLE', async () => {
      seedBaseline();
      const req = { params: { teamId: TEAM_1_ID }, user: { id: ADMIN_ID } };
      const { res } = await invoke(teamController.getWebhookSecret, req);

      assert.strictEqual(res.statusCode, 410);
      assert.deepStrictEqual(res.body, {
        success: false,
        code: 'WORKSPACE_WEBHOOKS_UNAVAILABLE',
        message: 'Workspace webhook integrations are not currently available.'
      });
      assert.strictEqual(db.executedQueries.length, 0, 'No database query on retired endpoint');
      assert.strictEqual(realtimeEvents.length, 0, 'No realtime events on retired endpoint');
    });

    await st.test('teamController.generateWebhookSecret returns HTTP 410 with WORKSPACE_WEBHOOKS_UNAVAILABLE', async () => {
      seedBaseline();
      const req = { params: { teamId: TEAM_1_ID }, user: { id: ADMIN_ID } };
      const { res } = await invoke(teamController.generateWebhookSecret, req);

      assert.strictEqual(res.statusCode, 410);
      assert.deepStrictEqual(res.body, {
        success: false,
        code: 'WORKSPACE_WEBHOOKS_UNAVAILABLE',
        message: 'Workspace webhook integrations are not currently available.'
      });
      assert.strictEqual(db.executedQueries.length, 0, 'No database query on retired endpoint');
      assert.strictEqual(realtimeEvents.length, 0, 'No realtime events on retired endpoint');
    });

    await st.test('Retired handlers never return whsec_dummy or any whsec_ credential', async () => {
      seedBaseline();
      const handlers = [
        collaborationController.getWebhookSecret,
        teamController.getWebhookSecret,
        teamController.generateWebhookSecret
      ];

      for (const h of handlers) {
        const req = { params: { teamId: TEAM_1_ID }, user: { id: OWNER_ID } };
        const { res } = await invoke(h, req);
        const bodyStr = JSON.stringify(res.body);

        assert.strictEqual(bodyStr.includes('whsec_dummy'), false, 'Response must never contain whsec_dummy');
        assert.strictEqual(bodyStr.includes('whsec_'), false, 'Response must never contain whsec_ credential');
        assert.strictEqual(bodyStr.includes('HMAC'), false, 'Response must never contain HMAC algorithm claim');
        assert.strictEqual(res.body.webhook_secret, undefined);
        assert.strictEqual(res.body.secret, undefined);
      }
    });

    await st.test('Zero HMAC derivation occurs in retired handlers (spying on crypto.createHmac)', async () => {
      seedBaseline();
      let hmacCalled = false;
      const originalCreateHmac = crypto.createHmac;
      try {
        crypto.createHmac = (...args) => {
          hmacCalled = true;
          return originalCreateHmac.apply(crypto, args);
        };

        const req = { params: { teamId: TEAM_1_ID }, user: { id: ADMIN_ID } };
        await invoke(collaborationController.getWebhookSecret, req);
        await invoke(teamController.getWebhookSecret, req);
        await invoke(teamController.generateWebhookSecret, req);

        assert.strictEqual(hmacCalled, false, 'crypto.createHmac must never be invoked by retired handlers');
      } finally {
        crypto.createHmac = originalCreateHmac;
      }
    });

    await st.test('Route wiring verification: collaborationRoutes and teamRoutes mount retired handlers without shadowing', async () => {
      const routesRecorded = [];
      const createMockRouter = () => {
        return {
          stack: [],
          use(...args) {},
          get(routePath, ...handlers) {
            routesRecorded.push({ method: 'GET', path: routePath, handler: handlers[handlers.length - 1] });
          },
          post(routePath, ...handlers) {
            routesRecorded.push({ method: 'POST', path: routePath, handler: handlers[handlers.length - 1] });
          },
          patch(routePath, ...handlers) {
            routesRecorded.push({ method: 'PATCH', path: routePath, handler: handlers[handlers.length - 1] });
          },
          delete(routePath, ...handlers) {
            routesRecorded.push({ method: 'DELETE', path: routePath, handler: handlers[handlers.length - 1] });
          }
        };
      };

      const mockExpress = () => createMockRouter();
      mockExpress.Router = createMockRouter;

      const origResolve = Module._resolveFilename;
      Module._resolveFilename = function(request, parent, isMain, options) {
        if (request === 'express') return 'express';
        return origResolve.call(this, request, parent, isMain, options);
      };

      try {
        const expressPath = 'express';
        const authMiddlewarePath = require.resolve('../middleware/authMiddleware');

        require.cache[expressPath] = {
          id: expressPath,
          filename: expressPath,
          loaded: true,
          exports: mockExpress
        };

        require.cache[authMiddlewarePath] = {
          id: authMiddlewarePath,
          filename: authMiddlewarePath,
          loaded: true,
          exports: {
            requireAuth: (req, res, next) => next()
          }
        };

        // Load routes
        const collabRoutes = require('../routes/collaborationRoutes');
        const tRoutes = require('../routes/teamRoutes');

        // Verify collaborationRoutes mounts getWebhookSecret at /teams/:teamId/webhook-secret
        const collabRoute = routesRecorded.find(r => r.method === 'GET' && r.path === '/teams/:teamId/webhook-secret');
        assert.ok(collabRoute, 'GET /teams/:teamId/webhook-secret route must be registered');
        const { res: resCollab } = await invoke(collabRoute.handler, { params: { teamId: TEAM_1_ID } });
        assert.strictEqual(resCollab.statusCode, 410);
        assert.strictEqual(resCollab.body.code, 'WORKSPACE_WEBHOOKS_UNAVAILABLE');

        // Verify teamRoutes mounts getWebhookSecret at /:teamId/webhook-secret
        const teamGetRoute = routesRecorded.find(r => r.method === 'GET' && r.path === '/:teamId/webhook-secret');
        assert.ok(teamGetRoute, 'GET /:teamId/webhook-secret route must be registered');
        const { res: resTeamGet } = await invoke(teamGetRoute.handler, { params: { teamId: TEAM_1_ID } });
        assert.strictEqual(resTeamGet.statusCode, 410);
        assert.strictEqual(resTeamGet.body.code, 'WORKSPACE_WEBHOOKS_UNAVAILABLE');

        // Verify teamRoutes mounts generateWebhookSecret at /:teamId/webhook-secret/generate
        const teamPostRoute = routesRecorded.find(r => r.method === 'POST' && r.path === '/:teamId/webhook-secret/generate');
        assert.ok(teamPostRoute, 'POST /:teamId/webhook-secret/generate route must be registered');
        const { res: resTeamPost } = await invoke(teamPostRoute.handler, { params: { teamId: TEAM_1_ID } });
        assert.strictEqual(resTeamPost.statusCode, 410);
        assert.strictEqual(resTeamPost.body.code, 'WORKSPACE_WEBHOOKS_UNAVAILABLE');
      } finally {
        Module._resolveFilename = origResolve;
      }
    });
  });

  // ── 8. HISTORICAL WORKSPACE ACTIVITY AUTHORIZATION & AUDIENCE ENFORCEMENT (PHASE 2.0U.6D.1) ──
  await t.test('Historical workspace activity authorization & announcement audience enforcement', async (st) => {
    const ANN_ALL_ID = 'a1111111-1111-4111-8111-111111111111';
    const ANN_TEAM_ID = 'a2222222-2222-4222-8222-222222222222';
    const ANN_BIZ_ID = 'b3333333-3333-4333-8333-333333333333';
    const ANN_DELETED_ID = 'd4444444-4444-4444-8444-444444444444';
    const ANN_TEAM2_ALL_ID = 'e5555555-5555-4555-8555-555555555555';

    const ACT_ALL_ID = 'c1111111-1111-4111-8111-111111111111';
    const ACT_TEAM_ID = 'c2222222-2222-4222-8222-222222222222';
    const ACT_BIZ_ID = 'c3333333-3333-4333-8333-333333333333';
    const ACT_PROJECT_ID = 'c4444444-4444-4444-8444-444444444444';
    const ACT_FILE_ID = 'c5555555-5555-4555-8555-555555555555';
    const ACT_MALFORMED_ID = 'c6666666-6666-4666-8666-666666666666';
    const ACT_MISSING_ID = 'c7777777-7777-4777-8777-777777777777';
    const ACT_ORPHAN_ID = 'c8888888-8888-4888-8888-888888888888';
    const ACT_CROSS_TEAM_ID = 'c9999999-9999-4999-8999-999999999999';
    const ACT_TEAM2_ID = 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const BIZ_SECRET_TITLE = 'CONFIDENTIAL: Q4 Executive Buyout Terms';

    const getActivities = (userId, ...rest) =>
      invoke(collaborationController.getWorkspaceActivities, {
        params: { teamId: rest.length ? rest[0] : TEAM_1_ID },
        user: userId ? { id: userId } : undefined
      });

    const activityQueries = () => db.executedQueries.filter((q) => q.table === 'workspace_activities');
    const announcementQueries = () => db.executedQueries.filter((q) => q.table === 'announcements');

    const seedHistoricalActivities = () => {
      db.announcements = [
        {
          id: ANN_ALL_ID,
          team_id: TEAM_1_ID,
          title: 'Company-Wide Townhall',
          content: 'Open to all',
          priority: 'normal',
          audience: 'all',
          scheduled_at: '2026-03-01T10:00:00.000Z'
        },
        {
          id: ANN_TEAM_ID,
          team_id: TEAM_1_ID,
          title: 'Sprint Retrospective',
          content: 'Engineering team sync',
          priority: 'high',
          audience: 'team',
          scheduled_at: '2026-03-02T10:00:00.000Z'
        },
        {
          id: ANN_BIZ_ID,
          team_id: TEAM_1_ID,
          title: BIZ_SECRET_TITLE,
          content: 'Strictly restricted to owners and admins',
          priority: 'urgent',
          audience: 'business',
          scheduled_at: '2026-03-03T10:00:00.000Z'
        },
        {
          id: ANN_TEAM2_ALL_ID,
          team_id: TEAM_2_ID,
          title: 'Team 2 Public Notice',
          content: 'Belongs to Team 2',
          priority: 'normal',
          audience: 'all',
          scheduled_at: '2026-03-04T10:00:00.000Z'
        }
      ];

      db.workspace_activities = [
        {
          id: ACT_PROJECT_ID,
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'project_created',
          entity_id: 'f1111111-1111-4111-8111-111111111111',
          entity_name: 'Q1 Roadmap',
          details: {},
          created_at: '2026-03-01T09:00:00.000Z',
          actor: { id: OWNER_ID, username: 'owner_user', full_name: 'Workspace Owner', avatar_url: null }
        },
        {
          id: ACT_ALL_ID,
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'announcement_posted',
          entity_id: ANN_ALL_ID,
          entity_name: 'Company-Wide Townhall',
          details: {},
          created_at: '2026-03-01T10:00:00.000Z',
          actor: { id: OWNER_ID, username: 'owner_user', full_name: 'Workspace Owner', avatar_url: null }
        },
        {
          id: ACT_TEAM_ID,
          team_id: TEAM_1_ID,
          user_id: ADMIN_ID,
          activity_type: 'announcement_posted',
          entity_id: ANN_TEAM_ID,
          entity_name: 'Sprint Retrospective',
          details: {},
          created_at: '2026-03-02T10:00:00.000Z',
          actor: { id: ADMIN_ID, username: 'admin_user', full_name: 'Workspace Admin', avatar_url: null }
        },
        {
          id: ACT_BIZ_ID,
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'announcement_posted',
          entity_id: ANN_BIZ_ID,
          entity_name: BIZ_SECRET_TITLE,
          details: { confidential_note: 'board-only' },
          created_at: '2026-03-03T10:00:00.000Z',
          actor: { id: OWNER_ID, username: 'sec_exec', full_name: 'Secret Executive', avatar_url: 'https://example.com/exec.png' }
        },
        {
          id: ACT_FILE_ID,
          team_id: TEAM_1_ID,
          user_id: MEMBER_ID,
          activity_type: 'file_uploaded',
          entity_id: 'f2222222-2222-4222-8222-222222222222',
          entity_name: 'architecture.pdf',
          details: {},
          created_at: '2026-03-04T10:00:00.000Z',
          actor: { id: MEMBER_ID, username: 'member_user', full_name: 'Team Member', avatar_url: null }
        },
        {
          id: ACT_TEAM2_ID,
          team_id: TEAM_2_ID,
          user_id: OWNER_ID,
          activity_type: 'project_created',
          entity_id: 'f3333333-3333-4333-8333-333333333333',
          entity_name: 'Team 2 Confidential Project',
          details: {},
          created_at: '2026-03-05T10:00:00.000Z',
          actor: { id: OWNER_ID, username: 'owner_user', full_name: 'Workspace Owner', avatar_url: null }
        }
      ];
    };

    // ── A. Authentication and team membership (Tests 1–7) ──

    await st.test('1. Missing authenticated requester receives 401', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const missingUser = await invoke(collaborationController.getWorkspaceActivities, { params: { teamId: TEAM_1_ID } });
      assert.strictEqual(missingUser.res.statusCode, 401);
      assert.strictEqual(missingUser.res.body.code, 'UNAUTHORIZED');

      const badUserId = await invoke(collaborationController.getWorkspaceActivities, {
        params: { teamId: TEAM_1_ID },
        user: { id: 'not-a-uuid' }
      });
      assert.strictEqual(badUserId.res.statusCode, 401);
      assert.strictEqual(badUserId.res.body.code, 'UNAUTHORIZED');
      assert.strictEqual(db.executedQueries.length, 0);
    });

    await st.test('2. Invalid team UUID receives 400', async () => {
      const badTeamIds = ['not-a-uuid', 'null', 'undefined', '', null, undefined, '11111111-1111-4111-8111-11111111111'];
      for (const badId of badTeamIds) {
        seedBaseline();
        seedHistoricalActivities();
        const { res, nextErr } = await getActivities(OWNER_ID, badId);
        assert.strictEqual(nextErr, null);
        assert.strictEqual(res.statusCode, 400, `expected 400 for teamId=${JSON.stringify(badId)}`);
        assert.strictEqual(res.body.code, 'INVALID_TEAM_ID');
        assert.strictEqual(db.executedQueries.length, 0);
      }
    });

    await st.test('3. Non-member receives 403', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res, nextErr } = await getActivities(NON_MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
      assert.strictEqual(activityQueries().length, 0);
    });

    await st.test('4. Team A member cannot retrieve Team B activity', async () => {
      seedBaseline();
      seedHistoricalActivities();
      for (const uid of [ADMIN_ID, MEMBER_ID]) {
        const { res, nextErr } = await getActivities(uid, TEAM_2_ID);
        assert.strictEqual(nextErr, null);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
        assert.ok(!JSON.stringify(res.body).includes('Team 2 Confidential Project'));
      }
      assert.strictEqual(activityQueries().length, 0);
    });

    await st.test('5. Membership lookup error fails closed', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const viaUser = await getActivities(AUTH_QUERY_FAIL_USER_ID, TEAM_1_ID);
      assert.ok(viaUser.nextErr, 'membership lookup error must propagate to next(err)');
      assert.strictEqual(viaUser.res.body, null);
      assert.strictEqual(activityQueries().length, 0);

      seedBaseline();
      seedHistoricalActivities();
      db.simulatedAuthError = { message: 'team_members connection lost', code: '500' };
      const viaGlobal = await getActivities(OWNER_ID, TEAM_1_ID);
      assert.ok(viaGlobal.nextErr);
      assert.strictEqual(viaGlobal.res.body, null);
      assert.strictEqual(activityQueries().length, 0);
    });

    await st.test('6. Unsupported membership role is denied (403) even if client supplies elevated role fields', async () => {
      for (const badRole of [null, undefined, '', 'guest', 'viewer', 'superadmin', 'billing']) {
        seedBaseline();
        seedHistoricalActivities();
        const memberRow = db.team_members.find((m) => m.team_id === TEAM_1_ID && m.user_id === MEMBER_ID);
        memberRow.role = badRole;
        memberRow.custom_role_id = CUSTOM_ROLE_ADMIN_NAMED_ID;

        const { res, nextErr } = await invoke(collaborationController.getWorkspaceActivities, {
          params: { teamId: TEAM_1_ID },
          user: { id: MEMBER_ID, role: 'owner', subscription_tier: 'enterprise' },
          query: { role: 'owner' },
          body: { role: 'owner' }
        });
        assert.strictEqual(nextErr, null);
        assert.strictEqual(res.statusCode, 403, `unsupported role ${JSON.stringify(badRole)} must be denied`);
        assert.strictEqual(res.body.code, 'INVALID_TEAM_ROLE');
        assert.strictEqual(activityQueries().length, 0, 'workspace_activities must not be queried for unsupported role');
      }
    });

    await st.test('7. No activity database query occurs before membership authorization succeeds', async () => {
      seedBaseline();
      seedHistoricalActivities();
      await getActivities(undefined, TEAM_1_ID);
      await getActivities(OWNER_ID, 'invalid-uuid');
      await getActivities(NON_MEMBER_ID, TEAM_1_ID);
      await getActivities(MEMBER_ID, TEAM_2_ID);
      await getActivities(AUTH_QUERY_FAIL_USER_ID, TEAM_1_ID);
      assert.strictEqual(activityQueries().length, 0, 'zero workspace_activities queries across all unauthorized requests');
      assert.strictEqual(announcementQueries().length, 0, 'zero announcements queries across all unauthorized requests');
    });

    // ── B. Owner/admin access (Tests 8–10) ──

    await st.test('8. Owner retains all historical activity records, including business announcement activity', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res, nextErr } = await getActivities(OWNER_ID, TEAM_1_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.length, 5);
      const ids = res.body.map((a) => a.id);
      assert.ok(ids.includes(ACT_BIZ_ID), 'owner must receive historical business announcement activity');
      assert.ok(ids.includes(ACT_ALL_ID));
      assert.ok(ids.includes(ACT_TEAM_ID));
      assert.ok(ids.includes(ACT_PROJECT_ID));
      assert.ok(ids.includes(ACT_FILE_ID));
      const bizAct = res.body.find((a) => a.id === ACT_BIZ_ID);
      assert.strictEqual(bizAct.entity_id, ANN_BIZ_ID);
      assert.strictEqual(bizAct.entity_name, BIZ_SECRET_TITLE);
    });

    await st.test('9. Admin retains all historical activity records, including business announcement activity', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res, nextErr } = await getActivities(ADMIN_ID, TEAM_1_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.length, 5);
      const bizAct = res.body.find((a) => a.id === ACT_BIZ_ID);
      assert.ok(bizAct, 'admin must receive historical business announcement activity');
      assert.strictEqual(bizAct.entity_id, ANN_BIZ_ID);
      assert.strictEqual(bizAct.entity_name, BIZ_SECRET_TITLE);
    });

    await st.test('10. Owner/admin retrieval does not perform an unnecessary announcement audience lookup', async () => {
      seedBaseline();
      seedHistoricalActivities();
      await getActivities(OWNER_ID, TEAM_1_ID);
      await getActivities(ADMIN_ID, TEAM_1_ID);
      assert.strictEqual(announcementQueries().length, 0, 'owners and admins must not trigger announcements lookup');
    });

    // ── C. Ordinary member filtering (Tests 11–24) ──

    await st.test('11. Member retains permitted all announcement activity', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res, nextErr } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      const allAct = res.body.find((a) => a.id === ACT_ALL_ID);
      assert.ok(allAct, 'member must retain audience=all announcement activity');
      assert.strictEqual(allAct.entity_id, ANN_ALL_ID);
      assert.strictEqual(allAct.entity_name, 'Company-Wide Townhall');
    });

    await st.test('12. Member retains permitted team announcement activity', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res, nextErr } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      const teamAct = res.body.find((a) => a.id === ACT_TEAM_ID);
      assert.ok(teamAct, 'member must retain audience=team announcement activity');
      assert.strictEqual(teamAct.entity_id, ANN_TEAM_ID);
      assert.strictEqual(teamAct.entity_name, 'Sprint Retrospective');
    });

    await st.test('13. Member cannot retrieve historical business announcement activity', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.find((a) => a.id === ACT_BIZ_ID), undefined);
      assert.strictEqual(res.body.length, 4);
    });

    await st.test('14. Member cannot obtain the restricted announcement UUID', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes(ANN_BIZ_ID), 'restricted announcement UUID must not appear in response');
    });

    await st.test('15. Member cannot obtain the restricted announcement title', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes(BIZ_SECRET_TITLE), 'restricted announcement title must not appear in response');
      assert.ok(!serialized.includes('Executive Buyout'), 'restricted title substring must not appear');
    });

    await st.test('16. Member cannot obtain the restricted activity ID or associated metadata', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes(ACT_BIZ_ID), 'restricted activity ID must not leak');
      assert.ok(!serialized.includes('2026-03-03T10:00:00.000Z'), 'restricted activity timestamp must not leak');
      assert.ok(!serialized.includes('sec_exec'), 'restricted activity actor username must not leak');
      assert.ok(!serialized.includes('Secret Executive'), 'restricted activity actor name must not leak');
      assert.ok(!serialized.includes('board-only'), 'restricted activity details metadata must not leak');
    });

    await st.test('17. Unrelated activity types remain available to ordinary members', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      const ids = res.body.map((a) => a.id);
      assert.ok(ids.includes(ACT_PROJECT_ID), 'project_created activity preserved');
      assert.ok(ids.includes(ACT_FILE_ID), 'file_uploaded activity preserved');
    });

    await st.test('18. Malformed announcement entity IDs are excluded for ordinary members', async () => {
      seedBaseline();
      seedHistoricalActivities();
      db.workspace_activities.push({
        id: ACT_MALFORMED_ID,
        team_id: TEAM_1_ID,
        user_id: OWNER_ID,
        activity_type: 'announcement_posted',
        entity_id: 'not-a-valid-uuid',
        entity_name: 'Legacy Malformed Announcement',
        details: {},
        created_at: '2026-03-05T00:00:00.000Z'
      });
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.body.find((a) => a.id === ACT_MALFORMED_ID), undefined);
      assert.ok(!JSON.stringify(res.body).includes('Legacy Malformed Announcement'));
    });

    await st.test('19. Missing announcement entity IDs are excluded for ordinary members', async () => {
      seedBaseline();
      seedHistoricalActivities();
      db.workspace_activities.push(
        {
          id: ACT_MISSING_ID,
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'announcement_posted',
          entity_id: null,
          entity_name: 'Null Entity Announcement',
          details: {},
          created_at: '2026-03-05T01:00:00.000Z'
        },
        {
          id: 'c7777778-7777-4777-8777-777777777778',
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'announcement_posted',
          entity_id: undefined,
          entity_name: 'Undefined Entity Announcement',
          details: {},
          created_at: '2026-03-05T02:00:00.000Z'
        }
      );
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.body.find((a) => a.id === ACT_MISSING_ID), undefined);
      assert.ok(!JSON.stringify(res.body).includes('Null Entity Announcement'));
      assert.ok(!JSON.stringify(res.body).includes('Undefined Entity Announcement'));
    });

    await st.test('20. Orphaned/deleted announcement references are excluded for ordinary members', async () => {
      seedBaseline();
      seedHistoricalActivities();
      db.workspace_activities.push({
        id: ACT_ORPHAN_ID,
        team_id: TEAM_1_ID,
        user_id: OWNER_ID,
        activity_type: 'announcement_posted',
        entity_id: ANN_DELETED_ID, // valid UUID, but not present in db.announcements
        entity_name: 'Deleted Announcement Title',
        details: {},
        created_at: '2026-03-05T03:00:00.000Z'
      });
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.body.find((a) => a.id === ACT_ORPHAN_ID), undefined);
      assert.ok(!JSON.stringify(res.body).includes('Deleted Announcement Title'));
      assert.ok(!JSON.stringify(res.body).includes(ANN_DELETED_ID));
    });

    await st.test('21. Cross-team announcement references are excluded for ordinary members', async () => {
      seedBaseline();
      seedHistoricalActivities();
      // Activity in Team 1 pointing to an announcement that belongs to Team 2 (even with audience='all')
      db.workspace_activities.push({
        id: ACT_CROSS_TEAM_ID,
        team_id: TEAM_1_ID,
        user_id: OWNER_ID,
        activity_type: 'announcement_posted',
        entity_id: ANN_TEAM2_ALL_ID,
        entity_name: 'Team 2 Public Notice',
        details: {},
        created_at: '2026-03-05T04:00:00.000Z'
      });
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.body.find((a) => a.id === ACT_CROSS_TEAM_ID), undefined);
      assert.ok(!JSON.stringify(res.body).includes('Team 2 Public Notice'));
      assert.ok(!JSON.stringify(res.body).includes(ANN_TEAM2_ALL_ID));
    });

    await st.test('22. Announcement lookup errors fail closed and return no activity data', async () => {
      seedBaseline();
      seedHistoricalActivities();
      db.simulatedAnnouncementSelectError = { message: 'announcements table timeout', code: '57014' };
      const { res, nextErr } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.ok(nextErr, 'announcement lookup error must be forwarded to next(err)');
      assert.strictEqual(nextErr.code, '57014');
      assert.strictEqual(res.body, null, 'must never return partially filtered or unfiltered activity data');
    });

    await st.test('23. No announcement lookup occurs when no announcement activity with valid UUID exists', async () => {
      seedBaseline();
      db.workspace_activities = [
        {
          id: ACT_PROJECT_ID,
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'project_created',
          entity_id: 'f1111111-1111-4111-8111-111111111111',
          entity_name: 'Q1 Roadmap',
          details: {},
          created_at: '2026-03-01T09:00:00.000Z'
        },
        {
          id: ACT_FILE_ID,
          team_id: TEAM_1_ID,
          user_id: MEMBER_ID,
          activity_type: 'file_uploaded',
          entity_id: 'f2222222-2222-4222-8222-222222222222',
          entity_name: 'architecture.pdf',
          details: {},
          created_at: '2026-03-04T10:00:00.000Z'
        }
      ];
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.length, 2);
      assert.strictEqual(announcementQueries().length, 0, 'no announcement lookup when no announcement_posted records exist');

      // Also verify when announcement_posted exists but has only malformed/missing entity_ids
      db.executedQueries.length = 0;
      db.workspace_activities.push({
        id: ACT_MALFORMED_ID,
        team_id: TEAM_1_ID,
        user_id: OWNER_ID,
        activity_type: 'announcement_posted',
        entity_id: 'bad-id',
        entity_name: 'Malformed',
        details: {},
        created_at: '2026-03-05T10:00:00.000Z'
      });
      const res2 = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res2.res.statusCode, 200);
      assert.strictEqual(res2.res.body.length, 2);
      assert.strictEqual(announcementQueries().length, 0, 'no announcement lookup when no valid UUID entity_id exists');
    });

    await st.test('24. The announcement lookup includes exact team constraint, ID restriction, and permitted audience restriction', async () => {
      seedBaseline();
      seedHistoricalActivities();
      await getActivities(MEMBER_ID, TEAM_1_ID.toUpperCase());

      const annQ = announcementQueries();
      assert.strictEqual(annQ.length, 1, 'exactly one announcements query executed');
      assert.strictEqual(annQ[0].selectedColumns, 'id');
      assertQueryFilter(annQ[0], 'team_id', TEAM_1_ID);

      const idFilter = annQ[0].filters.find((f) => f.col === 'id' && f.op === 'in');
      assert.ok(idFilter, 'must filter announcements by id IN (...)');
      assert.deepStrictEqual([...idFilter.val].sort(), [ANN_ALL_ID, ANN_BIZ_ID, ANN_TEAM_ID].sort());

      const audFilter = annQ[0].filters.find((f) => f.col === 'audience' && f.op === 'in');
      assert.ok(audFilter, 'must filter announcements by audience IN (...)');
      assert.deepStrictEqual([...audFilter.val].sort(), ['all', 'team']);
      assert.ok(!audFilter.val.includes('business'));
    });

    // ── D. Regression and preservation (Tests 25–27) ──

    await st.test('25. Existing activity ordering remains descending by created_at', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(
        res.body.map((a) => a.id),
        [ACT_FILE_ID, ACT_TEAM_ID, ACT_ALL_ID, ACT_PROJECT_ID],
        'activities must be ordered newest-first by created_at'
      );

      const actQ = activityQueries()[0];
      assert.deepStrictEqual(actQ.orderBy, { col: 'created_at', ascending: false });
    });

    await st.test('26. Existing limit remains 100', async () => {
      seedBaseline();
      for (let i = 0; i < 120; i++) {
        const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
        db.workspace_activities.push({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          team_id: TEAM_1_ID,
          user_id: OWNER_ID,
          activity_type: 'project_created',
          entity_id: 'f1111111-1111-4111-8111-111111111111',
          entity_name: `Project ${i}`,
          details: {},
          created_at: ts
        });
      }
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.length, 100, 'query must enforce maximum limit of 100');
      const actQ = activityQueries()[0];
      assert.strictEqual(actQ.limitCount, 100);
    });

    await st.test('27. Existing actor profile selection and response shape are preserved', async () => {
      seedBaseline();
      seedHistoricalActivities();
      const { res } = await getActivities(MEMBER_ID, TEAM_1_ID);
      assert.strictEqual(res.statusCode, 200);
      const actQ = activityQueries()[0];
      assert.strictEqual(actQ.selectedColumns, '*, actor:profiles(id, username, full_name, avatar_url)');
      assertQueryFilter(actQ, 'team_id', TEAM_1_ID);

      const first = res.body[0];
      assert.strictEqual(first.id, ACT_FILE_ID);
      assert.deepStrictEqual(first.actor, {
        id: MEMBER_ID,
        username: 'member_user',
        full_name: 'Team Member',
        avatar_url: null
      });
    });
  });

  // ── 7. RESIDUAL COLLABORATION RESOURCE AUTHORIZATION REPAIRS ───────────────
  await t.test('Residual collaboration resource authorization & tenant isolation', async (st) => {
    const collaborationController = require('../controllers/collaborationController');
    const PROJ_1_ID = '10101010-1010-4010-8010-101010101010';
    const PROJ_2_ID = '20202020-2020-4020-8020-202020202020';
    const TASK_1_ID = '30303030-3030-4030-8030-303030303030';
    const TASK_2_ID = '40404040-4040-4040-8040-404040404040';
    const CHK_1_ID = '50505050-5050-4050-8050-505050505050';
    const CHK_2_ID = '60606060-6060-4060-8060-606060606060';
    const FILE_1_ID = '80808080-8080-4080-8080-808080808080';
    const FILE_2_ID = '81818181-8181-4181-8181-818181818181';
    const MEET_1_ID = '90909090-9090-4090-8090-909090909090';
    const MEET_2_ID = '91919191-9191-4191-8191-919191919191';

    await st.test('1. Authenticated non-member denied project access (403)', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getProjects, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'NOT_TEAM_MEMBER');
    });

    await st.test('2. Invalid workspace ID rejected with 400', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getProjects, { user: { id: MEMBER_ID }, params: { teamId: 'not-a-uuid' } });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'INVALID_TEAM_ID');
    });

    await st.test('3. Cross-workspace project retrieval denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getProjects, { user: { id: MEMBER_ID }, params: { teamId: TEAM_2_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('4. Cross-workspace project update denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.updateProject, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, projectId: PROJ_2_ID }, body: { name: 'Hacked' } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('5. Cross-workspace project deletion denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.deleteProject, { user: { id: ADMIN_ID }, params: { teamId: TEAM_1_ID, projectId: PROJ_2_ID } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('6. Ordinary member cannot delete project owned by another (403)', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.deleteProject, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, projectId: PROJ_1_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('7. Cross-workspace task retrieval denied via parent project resolution', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getTasks, { user: { id: MEMBER_ID }, params: { projectId: PROJ_2_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('8. Cross-workspace task creation rejected', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createTask, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, projectId: PROJ_2_ID }, body: { title: 'Injected' } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('9. Cross-workspace task update denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.updateTask, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, taskId: TASK_2_ID }, body: { title: 'Hacked' } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('10. Cross-workspace task deletion denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.deleteTask, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, taskId: TASK_2_ID } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('11. Checklist IDOR denied for item belonging to another workspace', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.updateTaskChecklistItem, { user: { id: MEMBER_ID }, params: { itemId: CHK_2_ID }, body: { completed: true } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('12. Checklist deletion IDOR denied across workspaces', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.deleteTaskChecklistItem, { user: { id: MEMBER_ID }, params: { itemId: CHK_2_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('13. Task comments retrieval denied for task in another workspace', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getTaskComments, { user: { id: MEMBER_ID }, params: { taskId: TASK_2_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('14. Task comment insertion denied for task in another workspace', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.addTaskComment, { user: { id: MEMBER_ID }, params: { taskId: TASK_2_ID }, body: { content: 'Spam' } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('15. File metadata disclosure denied to non-members', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getWorkspaceFiles, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('16. Recycled files disclosure denied to non-members', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getRecycledFiles, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('17. Unauthorized folder creation denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createFolder, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID }, body: { name: 'Secret' } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('18. Unauthorized file metadata upload denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.uploadFileMetadata, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID }, body: { name: 'Malware.exe' } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('19. Cross-workspace favorite modification denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.toggleFileFavorite, { user: { id: MEMBER_ID }, params: { fileId: FILE_2_ID }, body: { isFavorite: true } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('20. Cross-workspace file recycling denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.recycleFile, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, fileId: FILE_2_ID }, body: { isRecycled: true } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('21. Unauthorized meeting retrieval denied to non-members', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getMeetings, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('22. Unauthorized meeting creation denied to non-members', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createMeeting, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID }, body: { title: 'Spam' } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('23. Cross-workspace meeting status update denied', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.updateMeetingStatus, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID, meetingId: MEET_2_ID }, body: { status: 'ended' } });
      assert.strictEqual(res.statusCode, 404);
    });

    await st.test('24. Workspace analytics denied to non-members', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getAnalytics, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID } }); 
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('25. Custom role retrieval denied to non-members', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.getCustomRoles, { user: { id: NON_MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('26. Custom role creation denied to ordinary members (requires admin/owner)', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createCustomRole, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID }, body: { name: 'SuperAdmin' } });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'INSUFFICIENT_PERMISSIONS');
    });

    await st.test('27. Custom role creation authorized for workspace admin', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createCustomRole, { user: { id: ADMIN_ID }, params: { teamId: TEAM_1_ID }, body: { name: 'Editor' } });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.name, 'Editor');
    });

    await st.test('28. Global department creation denied to non-global-admin (403)', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createDepartment, { user: { id: MEMBER_ID }, body: { name: 'Finance' } });
      assert.strictEqual(res.statusCode, 403);
    });

    await st.test('29. Global department creation authorized for global admin', async () => {
      seedBaseline();
      const { res } = await invoke(collaborationController.createDepartment, { user: { id: OWNER_ID }, body: { name: 'Marketing' } });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.name, 'Marketing');
    });

    await st.test('30. Legitimate workspace member retains full permitted access', async () => {
      seedBaseline();
      const { res: projRes } = await invoke(collaborationController.getProjects, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(projRes.statusCode, 200);
      assert.ok(Array.isArray(projRes.body));
      assert.strictEqual(projRes.body.length, 1);

      const { res: taskRes } = await invoke(collaborationController.getTasks, { user: { id: MEMBER_ID }, params: { projectId: PROJ_1_ID } });
      assert.strictEqual(taskRes.statusCode, 200);
      assert.strictEqual(taskRes.body.length, 1);

      const { res: fileRes } = await invoke(collaborationController.getWorkspaceFiles, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID }, query: {} });
      assert.strictEqual(fileRes.statusCode, 200);
      assert.strictEqual(fileRes.body.length, 1);

      const { res: meetRes } = await invoke(collaborationController.getMeetings, { user: { id: MEMBER_ID }, params: { teamId: TEAM_1_ID } });
      assert.strictEqual(meetRes.statusCode, 200);
      assert.strictEqual(meetRes.body.length, 1);
    });

    await st.test('31. Positive: updateProject succeeds without ReferenceError, logs activity and emits realtime event', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.updateProject, {
        user: { id: MEMBER_ID },
        params: { teamId: TEAM_1_ID, projectId: PROJ_1_ID },
        body: { name: 'Core Platform v2' }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.name, 'Core Platform v2');
      const updated = db.projects.find(p => p.id === PROJ_1_ID);
      assert.strictEqual(updated.name, 'Core Platform v2');
      const act = db.workspace_activities.find(a => a.activity_type === 'project_updated' && a.entity_id === PROJ_1_ID);
      assert.ok(act);
      assert.strictEqual(act.team_id, TEAM_1_ID);
      const ev = realtimeEvents.find(e => e.event === 'project:updated');
      assert.ok(ev);
      assert.strictEqual(ev.room, TEAM_1_ID);
    });

    await st.test('32. Positive: deleteProject succeeds without ReferenceError, logs activity and emits realtime event', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.deleteProject, {
        user: { id: OWNER_ID },
        params: { teamId: TEAM_1_ID, projectId: PROJ_1_ID }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const remaining = db.projects.find(p => p.id === PROJ_1_ID);
      assert.strictEqual(remaining, undefined);
      const act = db.workspace_activities.find(a => a.activity_type === 'project_deleted' && a.entity_id === PROJ_1_ID);
      assert.ok(act);
      assert.strictEqual(act.team_id, TEAM_1_ID);
      const ev = realtimeEvents.find(e => e.event === 'project:deleted');
      assert.ok(ev);
      assert.strictEqual(ev.room, TEAM_1_ID);
    });

    await st.test('33. Positive: createTask succeeds without ReferenceError, logs activity and emits realtime event', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.createTask, {
        user: { id: MEMBER_ID },
        params: { teamId: TEAM_1_ID, projectId: PROJ_1_ID },
        body: { title: 'New Sub-Feature', priority: 'high' }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.title, 'New Sub-Feature');
      const act = db.workspace_activities.find(a => a.activity_type === 'task_created' && a.entity_id === res.body.id);
      assert.ok(act);
      assert.strictEqual(act.team_id, TEAM_1_ID);
      const ev = realtimeEvents.find(e => e.event === 'task:created');
      assert.ok(ev);
      assert.strictEqual(ev.room, TEAM_1_ID);
    });

    await st.test('34. Positive: updateTask succeeds without ReferenceError, logs activity and emits realtime event', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.updateTask, {
        user: { id: MEMBER_ID },
        params: { teamId: TEAM_1_ID, taskId: TASK_1_ID },
        body: { title: 'Task 1 Completed', status: 'done' }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.title, 'Task 1 Completed');
      const act = db.workspace_activities.find(a => a.activity_type === 'task_completed' && a.entity_id === TASK_1_ID);
      assert.ok(act);
      assert.strictEqual(act.team_id, TEAM_1_ID);
      const ev = realtimeEvents.find(e => e.event === 'task:updated');
      assert.ok(ev);
      assert.strictEqual(ev.room, TEAM_1_ID);
    });

    await st.test('35. Positive: deleteTask succeeds without ReferenceError, logs activity and emits realtime event', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.deleteTask, {
        user: { id: MEMBER_ID },
        params: { teamId: TEAM_1_ID, taskId: TASK_1_ID }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const remaining = db.tasks.find(t => t.id === TASK_1_ID);
      assert.strictEqual(remaining, undefined);
      const act = db.workspace_activities.find(a => a.activity_type === 'task_deleted' && a.entity_id === TASK_1_ID);
      assert.ok(act);
      assert.strictEqual(act.team_id, TEAM_1_ID);
      const ev = realtimeEvents.find(e => e.event === 'task:deleted');
      assert.ok(ev);
      assert.strictEqual(ev.room, TEAM_1_ID);
    });

    await st.test('36. Positive: recycleFile succeeds without ReferenceError, logs activity and emits realtime event', async () => {
      seedBaseline();
      const { res, nextErr } = await invoke(collaborationController.recycleFile, {
        user: { id: MEMBER_ID },
        params: { teamId: TEAM_1_ID, fileId: FILE_1_ID },
        body: { isRecycled: true }
      });
      assert.strictEqual(nextErr, null);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.is_recycled, true);
      const act = db.workspace_activities.find(a => a.activity_type === 'file_recycled' && a.entity_id === FILE_1_ID);
      assert.ok(act);
      assert.strictEqual(act.team_id, TEAM_1_ID);
      const ev = realtimeEvents.find(e => e.event === 'file:recycled');
      assert.ok(ev);
      assert.strictEqual(ev.room, TEAM_1_ID);
    });
  });
});
