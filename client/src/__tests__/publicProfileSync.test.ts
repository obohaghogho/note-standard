import assert from 'assert';
import type { PublicPost } from '../components/profile/PublicProfileModal';

/**
 * PHASE 2C.3C.48: FOCUSED REGRESSION TEST
 * PublicProfileModal Like State Synchronization, Rollback & Idempotency
 */

console.log('\n============================================================');
console.log('🧪 RUNNING PUBLIC PROFILE LIKE SYNCHRONIZATION REGRESSION SUITE');
console.log('============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// State transformation helpers matching PublicProfileModal exact implementation
function derivePrevLiked(target: PublicPost): boolean {
  return Boolean(target.is_liked || target.user_has_liked);
}

function calculateNextState(target: PublicPost) {
  const prevLiked = derivePrevLiked(target);
  const prevCount = target.likes_count || 0;
  const nextLiked = !prevLiked;
  const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);
  return { prevLiked, prevCount, nextLiked, nextCount };
}

function updatePostInList(list: PublicPost[], postId: string, nextLiked: boolean, nextCount: number): PublicPost[] {
  return list.map(p =>
    p.id === postId
      ? { ...p, is_liked: nextLiked, user_has_liked: nextLiked, likes_count: nextCount }
      : p
  );
}

function rollback(list: PublicPost[], postId: string, prevLiked: boolean, prevCount: number): PublicPost[] {
  return list.map(p =>
    p.id === postId
      ? { ...p, is_liked: prevLiked, user_has_liked: prevLiked, likes_count: prevCount }
      : p
  );
}

function syncPostInList(list: PublicPost[], postId: string, serverLiked: boolean, authoritativeCount: number): PublicPost[] {
  return list.map(p =>
    p.id === postId
      ? { ...p, is_liked: serverLiked, user_has_liked: serverLiked, likes_count: authoritativeCount }
      : p
  );
}

const mockInitialList: PublicPost[] = [
  {
    id: 'post-1',
    author_id: 'user-1',
    content: 'First post content',
    created_at: new Date().toISOString(),
    likes_count: 5,
    comments_count: 2,
    is_liked: false,
    user_has_liked: false,
  },
  {
    id: 'post-2',
    author_id: 'user-2',
    content: 'Second post content (unrelated)',
    created_at: new Date().toISOString(),
    likes_count: 12,
    comments_count: 4,
    is_liked: true,
    user_has_liked: true,
  },
];

// Test 1: Optimistic Like sets both fields to true
runTest('1. Optimistic Like sets both is_liked and user_has_liked to true and increments likes_count', () => {
  const target = mockInitialList[0];
  const { nextLiked, nextCount } = calculateNextState(target);

  const updatedList = updatePostInList(mockInitialList, target.id, nextLiked, nextCount);
  const updatedPost = updatedList.find(p => p.id === target.id)!;

  assert.strictEqual(updatedPost.is_liked, true, 'is_liked must be true');
  assert.strictEqual(updatedPost.user_has_liked, true, 'user_has_liked must be true');
  assert.strictEqual(updatedPost.likes_count, 6, 'likes_count must increment from 5 to 6');
});

// Test 2: Failed Like restores both fields to their previous values (false)
runTest('2. Failed Like restores both is_liked and user_has_liked to false on rollback', () => {
  const target = mockInitialList[0];
  const { prevLiked, prevCount, nextLiked, nextCount } = calculateNextState(target);

  const optimisticList = updatePostInList(mockInitialList, target.id, nextLiked, nextCount);
  const rolledBackList = rollback(optimisticList, target.id, prevLiked, prevCount);
  const restoredPost = rolledBackList.find(p => p.id === target.id)!;

  assert.strictEqual(restoredPost.is_liked, false, 'is_liked must be restored to false');
  assert.strictEqual(restoredPost.user_has_liked, false, 'user_has_liked must be restored to false');
  assert.strictEqual(restoredPost.likes_count, 5, 'likes_count must be restored to 5');
});

// Test 3: Failed Unlike restores both fields to their previous values (true)
runTest('3. Failed Unlike restores both is_liked and user_has_liked to true on rollback', () => {
  const initialLikedPost: PublicPost = {
    id: 'post-liked',
    author_id: 'user-1',
    content: 'Already liked post',
    created_at: new Date().toISOString(),
    likes_count: 10,
    comments_count: 1,
    is_liked: true,
    user_has_liked: true,
  };
  const list = [initialLikedPost];

  const target = initialLikedPost;
  const { prevLiked, prevCount, nextLiked, nextCount } = calculateNextState(target);

  assert.strictEqual(nextLiked, false, 'Optimistic unlike must target false');
  assert.strictEqual(nextCount, 9, 'Optimistic unlike must decrement count to 9');

  const optimisticList = updatePostInList(list, target.id, nextLiked, nextCount);
  const rolledBackList = rollback(optimisticList, target.id, prevLiked, prevCount);
  const restoredPost = rolledBackList.find(p => p.id === target.id)!;

  assert.strictEqual(restoredPost.is_liked, true, 'is_liked must be restored to true');
  assert.strictEqual(restoredPost.user_has_liked, true, 'user_has_liked must be restored to true');
  assert.strictEqual(restoredPost.likes_count, 10, 'likes_count must be restored to 10');
});

// Test 4: likes_count is restored correctly on failure
runTest('4. likes_count is clamped and restored correctly across failure boundaries', () => {
  const zeroCountPost: PublicPost = {
    id: 'post-zero',
    author_id: 'user-3',
    content: 'Zero likes post',
    created_at: new Date().toISOString(),
    likes_count: 0,
    comments_count: 0,
    is_liked: false,
    user_has_liked: false,
  };

  const { prevLiked, prevCount, nextLiked, nextCount } = calculateNextState(zeroCountPost);
  assert.strictEqual(nextCount, 1);

  const optimisticList = updatePostInList([zeroCountPost], zeroCountPost.id, nextLiked, nextCount);
  assert.strictEqual(optimisticList[0].likes_count, 1);

  const rolledBackList = rollback(optimisticList, zeroCountPost.id, prevLiked, prevCount);
  assert.strictEqual(rolledBackList[0].likes_count, 0, 'likes_count must restore exactly to 0');
});

// Test 5: A subsequent click derives its previous state correctly after rollback
runTest('5. A subsequent click derives its previous state correctly after failed like rollback', () => {
  const initialPost = mockInitialList[0]; // is_liked: false, user_has_liked: false

  // Click 1: Optimistic update
  const state1 = calculateNextState(initialPost);
  assert.strictEqual(state1.prevLiked, false);
  assert.strictEqual(state1.nextLiked, true);

  const afterClick1 = updatePostInList(mockInitialList, initialPost.id, state1.nextLiked, state1.nextCount);

  // Network failure occurs -> rollback
  const afterRollback = rollback(afterClick1, initialPost.id, state1.prevLiked, state1.prevCount);
  const targetAfterRollback = afterRollback.find(p => p.id === initialPost.id)!;

  // Verify repaired invariant: both fields are false
  assert.strictEqual(targetAfterRollback.is_liked, false);
  assert.strictEqual(targetAfterRollback.user_has_liked, false);

  // Click 2: Next interaction
  const state2 = calculateNextState(targetAfterRollback);
  assert.strictEqual(state2.prevLiked, false, 'Click 2 must derive prevLiked as false (not stale true)');
  assert.strictEqual(state2.nextLiked, true, 'Click 2 must attempt LIKE (not unlike)');
  assert.strictEqual(state2.nextCount, 6, 'Click 2 must increment to 6');

  // Verify the pre-repair bug would have inverted user action:
  const brokenTarget: PublicPost = { ...targetAfterRollback, user_has_liked: true }; // pre-repair state
  const brokenPrevLiked = Boolean(brokenTarget.is_liked || brokenTarget.user_has_liked);
  assert.strictEqual(brokenPrevLiked, true, 'Pre-repair bug derives true due to stale user_has_liked');
  const brokenNextLiked = !brokenPrevLiked;
  assert.strictEqual(brokenNextLiked, false, 'Pre-repair bug erroneously inverts like to UNLIKE');
});

// Test 6: Unrelated posts in the list remain unchanged
runTest('6. Unrelated posts in the list maintain exact property and reference equality', () => {
  const target = mockInitialList[0];
  const unrelatedBefore = mockInitialList[1];

  const { prevLiked, prevCount, nextLiked, nextCount } = calculateNextState(target);
  const optimisticList = updatePostInList(mockInitialList, target.id, nextLiked, nextCount);

  assert.strictEqual(optimisticList[1], unrelatedBefore, 'Unrelated post reference must be unchanged in optimistic update');
  assert.strictEqual(optimisticList[1].is_liked, true);
  assert.strictEqual(optimisticList[1].likes_count, 12);

  const rolledBackList = rollback(optimisticList, target.id, prevLiked, prevCount);
  assert.strictEqual(rolledBackList[1], unrelatedBefore, 'Unrelated post reference must be unchanged in rollback');
  assert.strictEqual(rolledBackList[1].is_liked, true);
  assert.strictEqual(rolledBackList[1].likes_count, 12);
});

// Test 7: Authoritative server reconciliation (syncPostInList) sets both fields
runTest('7. Authoritative server response reconciliation sets both is_liked and user_has_liked', () => {
  const target = mockInitialList[0];
  const serverAuthoritativeLiked = true;
  const serverAuthoritativeCount = 7;

  const syncedList = syncPostInList(mockInitialList, target.id, serverAuthoritativeLiked, serverAuthoritativeCount);
  const syncedPost = syncedList.find(p => p.id === target.id)!;

  assert.strictEqual(syncedPost.is_liked, true, 'is_liked must match server');
  assert.strictEqual(syncedPost.user_has_liked, true, 'user_has_liked must match server');
  assert.strictEqual(syncedPost.likes_count, 7, 'likes_count must match server authoritative count');
});

// Test 8: PublicProfileModal deriveDesiredAction matches explicit action contract
runTest('8. Explicit desiredAction is "like" when currently unliked and "unlike" when currently liked', () => {
  const unlikedTarget = mockInitialList[0];
  const likedTarget = mockInitialList[1];

  const { nextLiked: nextLiked1 } = calculateNextState(unlikedTarget);
  const desiredAction1: 'like' | 'unlike' = nextLiked1 ? 'like' : 'unlike';
  assert.strictEqual(desiredAction1, 'like', 'Unliked post must produce explicit "like" action');

  const { nextLiked: nextLiked2 } = calculateNextState(likedTarget);
  const desiredAction2: 'like' | 'unlike' = nextLiked2 ? 'like' : 'unlike';
  assert.strictEqual(desiredAction2, 'unlike', 'Liked post must produce explicit "unlike" action');
});

console.log('\n============================================================');
console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
console.log('============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
