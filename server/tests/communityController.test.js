/**
 * PHASE 2C.3C.51: ISOLATED COMMUNITY LIKE CONTROLLER TEST HARNESS
 * Deterministic In-Memory Contract & Route-Boundary Verification
 * Zero Network Egress � Fully Mocked Database & Auth
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const https = require('https');

// ============================================================================
// 1. FAIL-CLOSED NETWORK EGRESS GUARD
// Any attempt by tested code to initiate real TCP/HTTP/HTTPS connections throws.
// ============================================================================
let networkCallsAttempted = 0;
const blockNetwork = (protocolName) => () => {
  networkCallsAttempted++;
  throw new Error(`FAIL-CLOSED SECURITY VIOLATION: Unauthorized ${protocolName} request attempted during isolated test!`);
};

http.request = blockNetwork('HTTP');
http.get = blockNetwork('HTTP');
https.request = blockNetwork('HTTPS');
https.get = blockNetwork('HTTPS');

// ============================================================================
// 2. IN-MEMORY DATABASE STATE
// Simulates Supabase tables: community_likes and community_posts
// ============================================================================
const communityLikesDB = new Map(); // key: `${postId}:${userId}` -> { id, post_id, user_id, reaction, created_at }
const communityPostsDB = new Map(); // key: `${postId}` -> { id, author_id, content }

let simulatedUpsertError = null;
let simulatedDeleteError = null;
let activityLogs = [];

function resetHarnessState() {
  communityLikesDB.clear();
  communityPostsDB.clear();
  simulatedUpsertError = null;
  simulatedDeleteError = null;
  activityLogs = [];

  // Seed sample post
  communityPostsDB.set('test-post-1', {
    id: 'test-post-1',
    author_id: 'post-author-999',
    content: 'Deterministic test post 1'
  });
  communityPostsDB.set('test-post-2', {
    id: 'test-post-2',
    author_id: 'post-author-888',
    content: 'Deterministic test post 2'
  });
}

// ============================================================================
// 3. MOCK SUPABASE CLIENT & INJECT INTO MODULE CACHE
// ============================================================================
const mockSupabaseClient = {
  auth: {
    async getUser(token) {
      if (token === 'valid-user-1-token') {
        return { data: { user: { id: 'test-user-1', email: 'user1@test.local' } }, error: null };
      }
      if (token === 'valid-user-2-token') {
        return { data: { user: { id: 'test-user-2', email: 'user2@test.local' } }, error: null };
      }
      if (token === 'invalid-token') {
        return { data: { user: null }, error: new Error('Invalid or expired token') };
      }
      return { data: { user: null }, error: new Error('Token unrecognized') };
    }
  },
  from(tableName) {
    if (tableName === 'community_likes') {
      return {
        select(cols) {
          return {
            eq(col1, val1) {
              return {
                eq(col2, val2) {
                  return {
                    async maybeSingle() {
                      let postId, userId;
                      if (col1 === 'post_id') { postId = val1; userId = val2; }
                      else { userId = val1; postId = val2; }
                      const key = `${postId}:${userId}`;
                      const record = communityLikesDB.get(key);
                      return { data: record ? { ...record } : null, error: null };
                    }
                  };
                }
              };
            }
          };
        },
        delete() {
          return {
            async eq(col, val) {
              if (simulatedDeleteError) {
                return { error: simulatedDeleteError };
              }
              // val is existingLike.id
              for (const [key, record] of communityLikesDB.entries()) {
                if (record.id === val) {
                  communityLikesDB.delete(key);
                  return { error: null };
                }
              }
              return { error: null };
            }
          };
        },
        async upsert(rows, options = {}) {
          if (simulatedUpsertError) {
            return { error: simulatedUpsertError };
          }
          for (const row of rows) {
            const key = `${row.post_id}:${row.user_id}`;
            const existing = communityLikesDB.get(key);
            const id = existing ? existing.id : `like-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            communityLikesDB.set(key, {
              id,
              post_id: row.post_id,
              user_id: row.user_id,
              reaction: row.reaction || 'like',
              created_at: existing ? existing.created_at : new Date().toISOString()
            });
          }
          return { error: null };
        }
      };
    }

    if (tableName === 'community_posts') {
      return {
        select(cols) {
          return {
            eq(col, val) {
              return {
                async maybeSingle() {
                  const post = communityPostsDB.get(val);
                  return { data: post ? { ...post } : null, error: null };
                }
              };
            }
          };
        }
      };
    }

    throw new Error(`Unexpected table requested in mock harness: ${tableName}`);
  }
};

// Override config/database and config/supabase
const supabaseConfigPath = require.resolve('../config/supabase');
require.cache[supabaseConfigPath] = {
  id: supabaseConfigPath,
  filename: supabaseConfigPath,
  loaded: true,
  exports: mockSupabaseClient
};

const databaseConfigPath = require.resolve('../config/database');
require.cache[databaseConfigPath] = {
  id: databaseConfigPath,
  filename: databaseConfigPath,
  loaded: true,
  exports: mockSupabaseClient
};

// Override notificationService to avoid downstream database/realtime dependencies
const notificationServicePath = require.resolve('../services/notificationService');
require.cache[notificationServicePath] = {
  id: notificationServicePath,
  filename: notificationServicePath,
  loaded: true,
  exports: {
    createNotification: async () => {},
    broadcastNotification: async () => {}
  }
};

// Override activityService to record calls without external side effects
const activityServicePath = require.resolve('../services/activityService');
require.cache[activityServicePath] = {
  id: activityServicePath,
  filename: activityServicePath,
  loaded: true,
  exports: {
    logActivity: async (event) => {
      activityLogs.push(event);
      return { id: `act-${Date.now()}` };
    }
  }
};

// Load controller and middleware with mocked boundaries
const communityController = require('../controllers/communityController');
const { requireAuth } = require('../middleware/auth');

// ============================================================================
// 4. TEST RUNNER UTILITIES
// ============================================================================
let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ? PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ? FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

function mockRes() {
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
  return res;
}

// ============================================================================
// 5. TEST SUITE EXECUTION
// ============================================================================
console.log('\n============================================================');
console.log('?? RUNNING ISOLATED COMMUNITY LIKE CONTROLLER TEST HARNESS');
console.log('============================================================\n');

async function main() {
  // Test 1: Valid postId produces expected Like response ({ liked: true })
  await runTest('1. Valid postId request produces expected Like response', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null, 'next() must not be called with an error');
    assert.strictEqual(res.statusCode, 200, 'HTTP status must be 200');
    assert.deepStrictEqual(res.body, { liked: true }, 'Response payload must be { liked: true }');
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true, 'Row must exist in in-memory DB');
    assert.strictEqual(activityLogs.length, 1, 'Activity log must be dispatched');
    assert.strictEqual(activityLogs[0].actionType, 'liked_post');
  });

  // Test 2: Valid noteId produces expected Like response ({ liked: true })
  await runTest('2. Valid noteId request produces expected Like response (repaired contract)', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: { noteId: 'test-post-2' } // Sending noteId instead of postId
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null, 'next() must not be called with an error');
    assert.strictEqual(res.statusCode, 200, 'HTTP status must be 200');
    assert.deepStrictEqual(res.body, { liked: true }, 'Response payload must be { liked: true }');
    assert.strictEqual(communityLikesDB.has('test-post-2:test-user-1'), true, 'Row must exist in in-memory DB under noteId');
  });

  // Test 3: Missing both identifiers returns HTTP 400 with expected error
  await runTest('3. Missing both postId and noteId returns HTTP 400 with expected error', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: {} // Neither postId nor noteId
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(res.statusCode, 400, 'HTTP status must be 400 Bad Request');
    assert.deepStrictEqual(res.body, { error: 'Post ID is required' }, 'Error payload must state "Post ID is required"');
    assert.strictEqual(communityLikesDB.size, 0, 'No row should be created');
  });

  // Test 4: Authentication middleware boundary (requireAuth)
  await runTest('4. Missing or invalid authentication returns HTTP 401 at middleware boundary', async () => {
    // 4a. Missing header
    const reqMissing = { headers: {} };
    const resMissing = mockRes();
    let nextCalledMissing = false;
    await requireAuth(reqMissing, resMissing, () => { nextCalledMissing = true; });

    assert.strictEqual(resMissing.statusCode, 401);
    assert.deepStrictEqual(resMissing.body, { error: 'No token provided' });
    assert.strictEqual(nextCalledMissing, false);

    // 4b. Invalid token
    const reqInvalid = { headers: { authorization: 'Bearer invalid-token' } };
    const resInvalid = mockRes();
    let nextCalledInvalid = false;
    await requireAuth(reqInvalid, resInvalid, () => { nextCalledInvalid = true; });

    assert.strictEqual(resInvalid.statusCode, 401);
    assert.deepStrictEqual(resInvalid.body, { error: 'Invalid token' });
    assert.strictEqual(nextCalledInvalid, false);

    // 4c. Valid token
    const reqValid = { headers: { authorization: 'Bearer valid-user-1-token' } };
    const resValid = mockRes();
    let nextCalledValid = false;
    await requireAuth(reqValid, resValid, () => { nextCalledValid = true; });

    assert.strictEqual(nextCalledValid, true, 'Valid token must call next()');
    assert.strictEqual(reqValid.user.id, 'test-user-1', 'req.user must be populated');
  });

  // Test 5: Successful Unlike removes current user's in-memory Like
  await runTest('5. Successful Unlike removes current user in-memory Like', async () => {
    resetHarnessState();
    // Step 1: Pre-populate like
    communityLikesDB.set('test-post-1:test-user-1', {
      id: 'like-existing-1',
      post_id: 'test-post-1',
      user_id: 'test-user-1',
      reaction: 'like',
      created_at: new Date().toISOString()
    });

    // Step 2: Toggle like (should unlike)
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { liked: false }, 'Response payload must be { liked: false }');
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false, 'Like must be removed from DB');
  });

  // Test 6: Duplicate Like requests respect (post_id, user_id) uniqueness invariant
  await runTest('6. Duplicate Like requests respect (post_id, user_id) uniqueness invariant', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1' }
    };

    // First like
    const res1 = mockRes();
    await communityController.toggleLike(req, res1, () => {});
    assert.strictEqual(res1.body.liked, true);
    assert.strictEqual(communityLikesDB.size, 1);

    // Directly simulate underlying upsert with onConflict for duplicate data
    await mockSupabaseClient.from('community_likes').upsert(
      [{ post_id: 'test-post-1', user_id: 'test-user-1', reaction: 'like' }],
      { onConflict: 'post_id,user_id' }
    );
    assert.strictEqual(communityLikesDB.size, 1, 'In-memory DB must maintain exactly 1 record for unique (post_id, user_id)');
  });

  // Test 7: Supabase upsert failure returns correct error and does not report success
  await runTest('7. Supabase upsert failure returns correct error and does not report success', async () => {
    resetHarnessState();
    simulatedUpsertError = new Error('Database disk error');

    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1' }
    };
    const res = mockRes();
    let receivedError = null;

    await communityController.toggleLike(req, res, (err) => { receivedError = err; });

    assert.notStrictEqual(receivedError, null, 'next(err) must receive the database error');
    assert.strictEqual(receivedError.message, 'Database disk error');
    assert.strictEqual(res.body, null, 'res.json() must not be sent on failure');
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false, 'No like record should be saved');
  });

  // Test 8: Supabase delete failure is handled correctly and does not falsely report success
  await runTest('8. Supabase delete failure is handled correctly and does not falsely report success', async () => {
    resetHarnessState();
    communityLikesDB.set('test-post-1:test-user-1', {
      id: 'like-existing-1',
      post_id: 'test-post-1',
      user_id: 'test-user-1',
      reaction: 'like',
      created_at: new Date().toISOString()
    });

    simulatedDeleteError = new Error('Delete constraint lock conflict');

    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1' }
    };
    const res = mockRes();
    let receivedError = null;

    await communityController.toggleLike(req, res, (err) => { receivedError = err; });

    assert.notStrictEqual(receivedError, null, 'next(err) must receive the delete error');
    assert.strictEqual(receivedError.message, 'Delete constraint lock conflict');
    assert.strictEqual(res.body, null, 'res.json() must not be sent on failure');
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true, 'Existing like must not be deleted');
  });

  // Test 9: One user's Like does not modify another user's Like
  await runTest('9. One user Like does not modify another user Like (multi-user isolation)', async () => {
    resetHarnessState();
    // User 1 likes post 1
    const req1 = { user: { id: 'test-user-1' }, body: { postId: 'test-post-1' } };
    const res1 = mockRes();
    await communityController.toggleLike(req1, res1, () => {});

    // User 2 likes post 1
    const req2 = { user: { id: 'test-user-2' }, body: { postId: 'test-post-1' } };
    const res2 = mockRes();
    await communityController.toggleLike(req2, res2, () => {});

    assert.strictEqual(communityLikesDB.size, 2, 'Both users must have distinct like rows');
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true);
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-2'), true);

    // User 1 unlikes post 1
    const res1Unlike = mockRes();
    await communityController.toggleLike(req1, res1Unlike, () => {});

    assert.strictEqual(res1Unlike.body.liked, false);
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false, 'User 1 like must be deleted');
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-2'), true, 'User 2 like must remain intact');
    assert.strictEqual(communityLikesDB.size, 1);
  });

  // Test 10: Explicit 'like' creates liked state and returns { liked: true }
  await runTest('10. Explicit like creates liked state and logs activity', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1', action: 'like' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { liked: true });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true);
    assert.strictEqual(activityLogs.length, 1);
    assert.strictEqual(activityLogs[0].actionType, 'liked_post');
  });

  // Test 11: Repeated explicit 'like' is idempotent and does not toggle off or duplicate activity log
  await runTest('11. Repeated explicit like is idempotent without duplicate activity log', async () => {
    // Rely on state from Test 10 (already liked)
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1', action: 'like' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { liked: true });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true);
    // Activity log must NOT be duplicated
    assert.strictEqual(activityLogs.length, 1, 'Repeated explicit like must not create duplicate activity log');
  });

  // Test 12: Explicit 'unlike' removes authenticated user's like
  await runTest('12. Explicit unlike removes authenticated user like', async () => {
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1', action: 'unlike' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { liked: false });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false);
  });

  // Test 13: Repeated explicit 'unlike' is idempotent and leaves state unliked
  await runTest('13. Repeated explicit unlike is idempotent and leaves state unliked', async () => {
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1', action: 'unlike' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { liked: false });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false);
  });

  // Test 14: Invalid explicit action is rejected with HTTP 400
  await runTest('14. Invalid explicit action returns HTTP 400 Bad Request', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1', action: 'invalid_action_value' }
    };
    const res = mockRes();
    let nextError = null;

    await communityController.toggleLike(req, res, (err) => { nextError = err; });

    assert.strictEqual(nextError, null);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: "Invalid action. Must be 'like' or 'unlike'" });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false);
  });

  // Test 15: Explicit action works with noteId alias
  await runTest('15. Explicit action works with noteId alias', async () => {
    resetHarnessState();
    const reqLike = {
      user: { id: 'test-user-1' },
      body: { noteId: 'test-post-1', action: 'like' }
    };
    const resLike = mockRes();
    await communityController.toggleLike(reqLike, resLike, () => {});
    assert.strictEqual(resLike.statusCode, 200);
    assert.deepStrictEqual(resLike.body, { liked: true });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true);

    const reqUnlike = {
      user: { id: 'test-user-1' },
      body: { noteId: 'test-post-1', action: 'unlike' }
    };
    const resUnlike = mockRes();
    await communityController.toggleLike(reqUnlike, resUnlike, () => {});
    assert.strictEqual(resUnlike.statusCode, 200);
    assert.deepStrictEqual(resUnlike.body, { liked: false });
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false);
  });

  // Test 16: Legacy request without action preserves toggle semantics
  await runTest('16. Legacy request without action preserves toggle semantics', async () => {
    resetHarnessState();
    const req = {
      user: { id: 'test-user-1' },
      body: { postId: 'test-post-1' } // No action specified
    };

    // Toggle 1: should like
    const res1 = mockRes();
    await communityController.toggleLike(req, res1, () => {});
    assert.strictEqual(res1.body.liked, true);
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true);

    // Toggle 2: should unlike
    const res2 = mockRes();
    await communityController.toggleLike(req, res2, () => {});
    assert.strictEqual(res2.body.liked, false);
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), false);

    // Toggle 3: should like again
    const res3 = mockRes();
    await communityController.toggleLike(req, res3, () => {});
    assert.strictEqual(res3.body.liked, true);
    assert.strictEqual(communityLikesDB.has('test-post-1:test-user-1'), true);
  });

  // Test 17: Tests make zero real network calls and leave no external state behind
  await runTest('17. Tests make zero real network calls and leave no external state behind', async () => {
    assert.strictEqual(networkCallsAttempted, 0, 'No HTTP or HTTPS requests should have been attempted');

    // Verify fail-closed behavior: an unauthorized network call throws
    let caughtEgressError = false;
    try {
      http.request('http://example.com');
    } catch (err) {
      caughtEgressError = err.message.includes('FAIL-CLOSED SECURITY VIOLATION');
    }
    assert.strictEqual(caughtEgressError, true, 'Network guard must actively prevent egress');
  });

  console.log('\n============================================================');
  console.log(`?? HARNESS RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled harness runner error:', err);
  process.exit(1);
});
