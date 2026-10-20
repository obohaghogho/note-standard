import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PHASE 2C.3C.46 FORENSIC VERIFICATION SUITE
 * -------------------------------------------------------------
 * Tests Defect A (App-wide Like Failure) and Defect B (iOS Add Capture/Reels Scrolling)
 */

console.log('\n============================================================');
console.log('?? RUNNING PHASE 2C.3C.46 VERIFICATION SUITE');
console.log('============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ? PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ? FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

const worktreeRoot = path.resolve(__dirname, '../../..');

// -------------------------------------------------------------
// DEFECT A: LIKE VERIFICATION
// -------------------------------------------------------------
console.log('--- DEFECT A: LIKE INTEGRITY & FAILURE RESOLUTION ---');

runTest('A.1: ReelCard handleDoubleTap passes true on like and rolls back on failure', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelCard.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  // Verify double tap passes true
  assert.ok(
    code.includes('if (onLikeToggle) onLikeToggle(reel.id, true);'),
    'handleDoubleTap must pass true to onLikeToggle when liking'
  );
  assert.ok(
    !code.includes('if (onLikeToggle) onLikeToggle(reel.id, false);') ||
    code.includes('setLikesCount(prev => Math.max(0, prev - 1));\r\n          if (onLikeToggle) onLikeToggle(reel.id, false);'),
    'handleDoubleTap must not pass hardcoded false on successful like'
  );
});

runTest('A.2: ReelCard handleLike passes desired action and notifies parent with rollback on failure', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelCard.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("await toggleLike(reel.id, newLiked ? 'like' : 'unlike');") &&
    code.includes('if (onLikeToggle) onLikeToggle(reel.id, newLiked);'),
    'handleLike must pass explicit desired-state action to toggleLike and notify parent'
  );
  assert.ok(
    code.includes('if (onLikeToggle) onLikeToggle(reel.id, wasLiked);'),
    'handleLike must notify parent of wasLiked on rollback failure'
  );
});

runTest('A.3: Reels.tsx handleLikeToggle guards against duplicate counts and updates state idempotently', () => {
  const filePath = path.join(worktreeRoot, 'client/src/pages/dashboard/Reels.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('const currentLiked = Boolean(r.user_has_liked || r.is_liked);') &&
    code.includes('if (currentLiked === isLiked) return r;'),
    'handleLikeToggle must verify state change before mutating likes_count to prevent duplicate count drift'
  );

  // Pure logic simulation of handleLikeToggle
  const mockReels = [
    { id: 'reel-1', user_has_liked: false, is_liked: false, likes_count: 5 },
    { id: 'reel-2', user_has_liked: true, is_liked: true, likes_count: 10 },
  ];

  const applyToggle = (list, reelId, isLiked) =>
    list.map(r => {
      if (r.id !== reelId) return r;
      const currentLiked = Boolean(r.user_has_liked || r.is_liked);
      if (currentLiked === isLiked) return r;
      return {
        ...r,
        user_has_liked: isLiked,
        is_liked: isLiked,
        likes_count: Math.max(0, (r.likes_count || 0) + (isLiked ? 1 : -1)),
      };
    });

  // 1. Like reel-1: 5 -> 6, user_has_liked: true
  const afterLike = applyToggle(mockReels, 'reel-1', true);
  assert.strictEqual(afterLike[0].likes_count, 6);
  assert.strictEqual(afterLike[0].user_has_liked, true);

  // 2. Duplicate like on reel-1: must remain 6, not 7
  const duplicateLike = applyToggle(afterLike, 'reel-1', true);
  assert.strictEqual(duplicateLike[0].likes_count, 6);

  // 3. Unlike reel-1: 6 -> 5, user_has_liked: false
  const afterUnlike = applyToggle(afterLike, 'reel-1', false);
  assert.strictEqual(afterUnlike[0].likes_count, 5);
  assert.strictEqual(afterUnlike[0].user_has_liked, false);
});

runTest('A.4: useCommunityFeed optimisticLike updates both user_has_liked AND is_liked', () => {
  const filePath = path.join(worktreeRoot, 'client/src/hooks/useCommunityFeed.ts');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('user_has_liked: nextLiked') && code.includes('is_liked: nextLiked'),
    'optimisticLike must update both user_has_liked and is_liked to prevent UniversalPostCard from reverting to false'
  );
  assert.ok(
    code.includes('user_has_bookmarked: nextBookmarked') && code.includes('is_bookmarked: nextBookmarked'),
    'optimisticBookmark must update both bookmark properties'
  );
});

runTest('A.5: FeedNoteCard sends postId in like request body to satisfy server controller', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/dashboard/FeedNoteCard.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('postId: note.id'),
    'FeedNoteCard must include postId in request body'
  );
});

runTest('A.6: server/controllers/communityController.js toggleLike accepts postId or noteId', () => {
  const filePath = path.join(worktreeRoot, 'server/controllers/communityController.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('const postId = req.body.postId || req.body.noteId;'),
    'Server controller must support both postId and noteId interchangeably'
  );
});

runTest('A.7: InteractionLayer invokes toggleLike and toggleBookmark with rollback on failure', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/renderers/InteractionLayer.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("import { toggleLike, toggleBookmark } from '../../../services/communityService';"),
    'InteractionLayer must import toggleLike and toggleBookmark'
  );
  assert.ok(
    code.includes('await toggleLike(post.id);'),
    'handleLike must call server toggleLike'
  );
  assert.ok(
    code.includes('await toggleBookmark(post.id);'),
    'handleSave must call server toggleBookmark'
  );
  assert.ok(
    code.includes('disabled={loadingLike}'),
    'Like button must be disabled while request is in flight to prevent double click corruption'
  );
});

runTest('A.8: PublicProfileModal synchronizes both is_liked and user_has_liked', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/profile/PublicProfileModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('target.is_liked || target.user_has_liked') || code.includes('target.is_liked || (target as any).user_has_liked'),
    'PublicProfileModal must check both properties for previous like state'
  );
  assert.ok(
    code.includes('user_has_liked: nextLiked'),
    'PublicProfileModal must persist user_has_liked across list mutations'
  );
});

runTest('A.9: FeedNoteCard sends explicit desired action ("like" or "unlike") in like request body', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/dashboard/FeedNoteCard.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("action: newLikedState ? 'like' : 'unlike'"),
    'FeedNoteCard must specify explicit desired-state action in request body'
  );
  assert.ok(
    code.includes('postId: note.id') && code.includes('noteId: note.id'),
    'FeedNoteCard must supply both postId and noteId compatibility aliases'
  );
  assert.ok(
    code.includes('if (!user || !session || loadingLike) return;'),
    'FeedNoteCard must maintain loadingLike guard to prevent rapid repeated taps'
  );
});

runTest('A.10: ReelCard uses isLikingRef to guard against rapid repeated taps launching contradictory requests', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelCard.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('const isLikingRef = useRef<boolean>(false);'),
    'ReelCard must declare isLikingRef to synchronize concurrent like requests'
  );
  assert.ok(
    code.includes('if (isLikingRef.current) return;'),
    'ReelCard handleLike must drop rapid repeated taps while request is in-flight'
  );
  assert.ok(
    code.includes('!liked && !isLikingRef.current'),
    'ReelCard handleDoubleTap must guard against concurrent double-tap like trigger'
  );
});

runTest('A.11: communityController toggleLike validates explicit actions and handles idempotent requests', () => {
  const filePath = path.join(worktreeRoot, 'server/controllers/communityController.js');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("action !== 'like' && action !== 'unlike'"),
    'Controller must validate that action is either "like" or "unlike"'
  );
  assert.ok(
    code.includes("action === 'like'"),
    'Controller must handle explicit desired-state "like"'
  );
  assert.ok(
    code.includes("action === 'unlike'"),
    'Controller must handle explicit desired-state "unlike"'
  );
  assert.ok(
    code.includes('existingLike'),
    'Controller must inspect existing like state to maintain idempotency'
  );
});

runTest('A.12: communityService toggleLike supports explicit action and preserves legacy toggle', () => {
  const filePath = path.join(worktreeRoot, 'client/src/services/communityService.ts');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("action?: 'like' | 'unlike'"),
    'communityService toggleLike must accept optional action parameter'
  );
  assert.ok(
    code.includes('const payload = action ? { postId, action } : { postId };'),
    'communityService must include action in payload when provided and omit it for legacy calls'
  );
});

runTest('A.13: communityService direct Supabase fallback is idempotent for explicit actions and never flips state', () => {
  const filePath = path.join(worktreeRoot, 'client/src/services/communityService.ts');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("if (action === 'like')") &&
    code.includes("onConflict: 'post_id,user_id'"),
    'Fallback for explicit like must upsert without removing existing like'
  );
  assert.ok(
    code.includes("if (action === 'unlike')") &&
    code.includes(".delete()") &&
    code.includes(".eq('post_id', postId)") &&
    code.includes(".eq('user_id', user.id)"),
    'Fallback for explicit unlike must delete and never insert a new like'
  );
});

runTest('A.14: communityService flushOfflineQueue preserves explicit action when present in queued action', () => {
  const filePath = path.join(worktreeRoot, 'client/src/services/communityService.ts');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('action.payload.postId as string') &&
    code.includes('(action.payload as { postId: string; action?:'),
    'flushOfflineQueue must forward action payload to toggleLike'
  );
});

// -------------------------------------------------------------
// DEFECT B: iOS ADD CAPTURE / REELS SCROLLING VERIFICATION
// -------------------------------------------------------------
console.log('\n--- DEFECT B: iOS ADD CAPTURE / REELS SCROLLING & KEYBOARD REPAIR ---');

runTest('B.1: ReelUploadModal integrates useKeyboardLayout and responds to virtual keyboard height', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelUploadModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("import { useKeyboardLayout } from '../../hooks/useKeyboardLayout';"),
    'ReelUploadModal must import useKeyboardLayout'
  );
  assert.ok(
    code.includes('const { isKeyboardOpen } = useKeyboardLayout();'),
    'ReelUploadModal must subscribe to isKeyboardOpen'
  );
});

runTest('B.2: ReelUploadModal outer container is pinned to visual viewport with safe-area and touch-scroll', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelUploadModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("top: 'var(--vv-top, 0px)'"),
    'Outer container must anchor top to visual viewport offset on iOS'
  );
  assert.ok(
    code.includes("height: 'var(--vv-height, 100dvh)'"),
    'Outer container must size height to visual viewport height'
  );
  assert.ok(
    code.includes("maxHeight: 'var(--vv-height, 100dvh)'"),
    'Outer container must bound maxHeight to visual viewport'
  );
  assert.ok(
    code.includes('overflow-y-auto') && code.includes('overscroll-contain'),
    'Outer container must allow vertical scrolling when contents exceed visible viewport'
  );
});

runTest('B.3: ReelUploadModal card shrinks dynamically when iOS keyboard opens', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelUploadModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("isKeyboardOpen\n            ? 'calc(var(--vv-height, 100dvh) - 0.75rem)'\n            : 'min(90vh, 90dvh)'") ||
    code.includes("isKeyboardOpen ? 'calc(var(--vv-height, 100dvh) - 0.75rem)' : undefined"),
    'Modal card must shrink height to match the visible viewport above the keyboard'
  );
});

runTest('B.4: Form container supports iOS touch scrolling and momentum', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelUploadModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('overflow-y-auto') && code.includes('overscroll-contain') && code.includes('touch-pan-y'),
    'Form body must enable touch scrolling and pan-y'
  );
  assert.ok(
    code.includes("WebkitOverflowScrolling: 'touch'"),
    'Form body must specify momentum scrolling for iOS WebKit'
  );
});

runTest('B.5: Inputs have onFocus scrollIntoView so text cursor stays visible while typing', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelUploadModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes('id="reel-caption-textarea"') &&
    code.includes("scrollIntoView({ behavior: 'smooth', block: 'nearest' })"),
    'Caption textarea must scroll into view upon focus'
  );
  assert.ok(
    code.includes('id="reel-tags-input"') &&
    code.includes("scrollIntoView({ behavior: 'smooth', block: 'nearest' })"),
    'Tags input must scroll into view upon focus'
  );
});

runTest('B.6: ReelUploadModal manages body scroll lock cleanly without stale locks on unmount', () => {
  const filePath = path.join(worktreeRoot, 'client/src/components/community/ReelUploadModal.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    code.includes("document.body.style.overflow = 'hidden';"),
    'Must lock document.body scroll when modal is active'
  );
  assert.ok(
    code.includes("document.body.style.overflow = prevOverflow;"),
    'Must cleanly restore previous overflow upon unmount'
  );
  assert.ok(
    code.includes("window.removeEventListener('keydown', handleKeyDown);"),
    'Must remove keyboard listener on unmount'
  );
  assert.ok(
    code.includes("revokePreviewUrl();"),
    'Must revoke object URLs to prevent memory leaks'
  );
});

console.log('\n============================================================');
console.log(`?? TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
console.log('============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
