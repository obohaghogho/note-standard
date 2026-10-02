/**
 * REEL DELETE OWNERSHIP SECURITY VERIFICATION SUITE
 */

const path = require('path');

const mockPostsDB = new Map();

function resetMockDB() {
  mockPostsDB.clear();
  mockPostsDB.set('reel-owner-123', {
    id: 'reel-owner-123',
    author_id: 'user-owner-aaa',
    content: 'User A Reel Video',
    media_urls: ['https://cloudinary.com/video1.mp4']
  });
  mockPostsDB.set('reel-user-456', {
    id: 'reel-user-456',
    author_id: 'user-other-bbb',
    content: 'User B Reel Video',
    media_urls: ['https://cloudinary.com/video2.mp4']
  });
}

// Override require("../config/database") cache before loading communityController
const dbPath = require.resolve('../config/database');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    from(tableName) {
      if (tableName !== 'community_posts') {
        throw new Error(`Unexpected table ${tableName}`);
      }
      return {
        select(cols) {
          return {
            eq(col, val) {
              return {
                async maybeSingle() {
                  const item = mockPostsDB.get(val);
                  return { data: item ? { ...item } : null, error: null };
                }
              };
            }
          };
        },
        delete() {
          return {
            eq(col, val) {
              mockPostsDB.delete(val);
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  }
};

// Override notificationService cache to avoid downstream DB requirements
const notifPath = require.resolve('../services/notificationService');
require.cache[notifPath] = {
  id: notifPath,
  filename: notifPath,
  loaded: true,
  exports: {
    createNotification: async () => {},
    broadcastNotification: async () => {}
  }
};

// Override activityService cache
const actPath = require.resolve('../services/activityService');
require.cache[actPath] = {
  id: actPath,
  filename: actPath,
  loaded: true,
  exports: {
    logActivity: async () => {}
  }
};

const communityController = require('../controllers/communityController');

async function runReelDeleteOwnershipSecuritySuite() {
  console.log('====================================================');
  console.log('REEL DELETE OWNERSHIP SECURITY VERIFICATION SUITE');
  console.log('====================================================');

  // Test 1: Non-Owner Deletion Attempt (User B trying to delete User A's Reel)
  resetMockDB();
  const reqNonOwner = {
    user: { id: 'user-other-bbb', role: 'user' },
    params: { postId: 'reel-owner-123' }
  };

  let statusNonOwner = 200;
  let jsonNonOwner = null;

  const resNonOwner = {
    status(code) { statusNonOwner = code; return this; },
    json(payload) { jsonNonOwner = payload; return this; }
  };

  await communityController.deletePost(reqNonOwner, resNonOwner, (err) => {
    if (err) throw err;
  });

  console.log(`\n[Test 1] Non-Owner Delete Attempt Response Status: ${statusNonOwner}`);
  console.log(`[Test 1] Response Payload:`, JSON.stringify(jsonNonOwner));

  if (statusNonOwner !== 403) {
    throw new Error(`SECURITY FAIL: Expected HTTP 403 Forbidden for non-owner delete attempt, got ${statusNonOwner}`);
  }
  if (!jsonNonOwner || !jsonNonOwner.error || !jsonNonOwner.error.includes('Unauthorized')) {
    throw new Error(`SECURITY FAIL: Expected authorization rejection message, got ${JSON.stringify(jsonNonOwner)}`);
  }
  console.log('PASS: Test 1 - Non-owner deletion attempt rejected with HTTP 403 Forbidden.');

  // Test 2: Verify DB record remains 100% intact after non-owner attempt
  const postStillExists = mockPostsDB.get('reel-owner-123');
  if (!postStillExists) {
    throw new Error('SECURITY FAIL: Database row was deleted despite unauthorized request rejection!');
  }
  if (postStillExists.media_urls[0] !== 'https://cloudinary.com/video1.mp4') {
    throw new Error('SECURITY FAIL: Media metadata was mutated!');
  }
  console.log('PASS: Test 2 - Database row and media metadata remained 100% intact after unauthorized attempt.');

  // Test 3: ID Substitution Attack (User B substituting User A's reel ID)
  const reqIDSub = {
    user: { id: 'user-other-bbb', role: 'user' },
    params: { postId: 'reel-owner-123' }
  };

  let statusSub = 200;
  let jsonSub = null;
  const resSub = {
    status(code) { statusSub = code; return this; },
    json(payload) { jsonSub = payload; return this; }
  };

  await communityController.deletePost(reqIDSub, resSub, (err) => {});

  if (statusSub !== 403) {
    throw new Error(`SECURITY FAIL: ID substitution attack returned ${statusSub} instead of 403 Forbidden`);
  }
  console.log('PASS: Test 3 - ID substitution attack rejected with HTTP 403 Forbidden.');

  // Test 4: Authorized Owner Deletion (User A deleting User A's Reel)
  resetMockDB();
  const reqOwner = {
    user: { id: 'user-owner-aaa', role: 'user' },
    params: { postId: 'reel-owner-123' }
  };

  let statusOwner = 200;
  let jsonOwner = null;
  const resOwner = {
    status(code) { statusOwner = code; return this; },
    json(payload) { jsonOwner = payload; return this; }
  };

  await communityController.deletePost(reqOwner, resOwner, (err) => {});

  console.log(`\n[Test 4] Owner Delete Attempt Response Status: ${statusOwner}`);
  console.log(`[Test 4] Response Payload:`, JSON.stringify(jsonOwner));

  if (statusOwner !== 200 || !jsonOwner?.success) {
    throw new Error(`FUNCTIONALITY FAIL: Expected HTTP 200 OK for owner delete, got ${statusOwner}`);
  }
  if (mockPostsDB.has('reel-owner-123')) {
    throw new Error('FAIL: Database row was not removed after authorized owner delete!');
  }
  console.log('PASS: Test 4 - Authorized owner deletion succeeded.');

  // Test 5: Admin Moderation Deletion (Admin deleting User A's Reel)
  resetMockDB();
  const reqAdmin = {
    user: { id: 'admin-user-777', role: 'admin' },
    params: { postId: 'reel-owner-123' }
  };

  let statusAdmin = 200;
  let jsonAdmin = null;
  const resAdmin = {
    status(code) { statusAdmin = code; return this; },
    json(payload) { jsonAdmin = payload; return this; }
  };

  await communityController.deletePost(reqAdmin, resAdmin, (err) => {});

  if (statusAdmin !== 200 || !jsonAdmin?.success) {
    throw new Error(`FUNCTIONALITY FAIL: Expected HTTP 200 OK for admin delete, got ${statusAdmin}`);
  }
  if (mockPostsDB.has('reel-owner-123')) {
    throw new Error('FAIL: Database row was not removed after admin moderation delete!');
  }
  console.log('PASS: Test 5 - Admin moderation deletion preserved & functional.');

  console.log('\n====================================================');
  console.log('REEL DELETE OWNERSHIP SECURITY AUDIT: ALL TESTS PASSED');
  console.log('====================================================');
}

runReelDeleteOwnershipSecuritySuite().catch((err) => {
  console.error('[TEST SUITE ERROR]', err);
  process.exit(1);
});
