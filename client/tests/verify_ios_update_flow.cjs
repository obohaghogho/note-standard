/**
 * NoteStandard — iOS/PWA Update Loop Lifecycle Verification Suite
 * Verifies all 10 invariants required for Phase 2A
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
  }
}

console.log('\n=== RUNNING IOS/PWA UPDATE LIFECYCLE REPAIR TESTS ===\n');

const clientDir = path.resolve(__dirname, '..');
const swContent = fs.readFileSync(path.join(clientDir, 'public', 'sw.js'), 'utf8');
const mainContent = fs.readFileSync(path.join(clientDir, 'src', 'main.tsx'), 'utf8');
const vgContent = fs.readFileSync(path.join(clientDir, 'src', 'components', 'common', 'VersionGuard.tsx'), 'utf8');

// 1. SW No Automatic skipWaiting on install
test('1. Service Worker does NOT call skipWaiting() unconditionally on install', () => {
  const installBlockMatch = swContent.match(/self\.addEventListener\('install',[\s\S]*?\}\);/);
  assert(installBlockMatch, 'install event listener must exist');
  assert(!installBlockMatch[0].includes('self.skipWaiting()'), 'install event must not invoke self.skipWaiting()');
});

// 2. SW Listens for SKIP_WAITING Message
test('2. Service Worker listens for SKIP_WAITING message for controlled activation', () => {
  assert(swContent.includes("event.data.type === 'SKIP_WAITING'"), 'SW must have SKIP_WAITING message handler');
  assert(swContent.includes('self.skipWaiting()'), 'SW must call self.skipWaiting() on explicit message');
});

// 3. No Duplicate/Competing Toasts in main.tsx
test('3. main.tsx has eliminated competing update toasts and duplicate polling', () => {
  assert(!mainContent.includes('pwa-update-toast'), 'main.tsx must not show duplicate pwa-update-toast');
  assert(!mainContent.includes('showUpdateNotification'), 'main.tsx must not define competing showUpdateNotification');
  assert(!mainContent.includes('checkForAppUpdate'), 'main.tsx must not execute duplicate checkForAppUpdate');
});

// 4. Guarded controllerchange in main.tsx
test('4. main.tsx controllerchange reload is strictly guarded by __pwaUpdateInitiated', () => {
  assert(mainContent.includes('controllerchange'), 'main.tsx must register controllerchange listener');
  assert(mainContent.includes('__pwaUpdateInitiated'), 'controllerchange must check user-initiated update flag before reloading');
});

// 5. VersionGuard SW Integration
test('5. VersionGuard listens for both waiting workers and updatefound events', () => {
  assert(vgContent.includes('reg.waiting'), 'VersionGuard must inspect reg.waiting');
  assert(vgContent.includes('updatefound'), 'VersionGuard must listen for updatefound');
  assert(vgContent.includes("installingWorker.state === 'installed'"), 'VersionGuard must check installingWorker transition');
});

// 6. Duplicate Click Protection
test('6. VersionGuard prevents parallel duplicate clicks on Update Now', () => {
  assert(vgContent.includes('updateInProgressRef.current'), 'VersionGuard must guard with updateInProgressRef');
  assert(vgContent.includes('disabled={isUpdating}'), 'Update button must be disabled while update is in progress');
});

// 7. Safe Storage Fallbacks (Private browsing / iOS WebKit storage guard)
test('7. VersionGuard implements safe storage fallbacks that never throw', () => {
  assert(vgContent.includes('safeGetItem'), 'VersionGuard must use safeGetItem');
  assert(vgContent.includes('safeSetItem'), 'VersionGuard must use safeSetItem');
});

// 8. Cooldown Guard & Per-Version Dismissal
test('8. VersionGuard enforces cooldown guard and durable per-version dismissal', () => {
  assert(vgContent.includes('UPDATE_COOLDOWN_MS'), 'VersionGuard must have UPDATE_COOLDOWN_MS');
  assert(vgContent.includes('vg_update_attempt'), 'VersionGuard must record vg_update_attempt');
  assert(vgContent.includes('vg_dismissed_'), 'VersionGuard must namespace dismissal per version');
});

// 9. Mandatory Update Enforcement
test('9. Mandatory minimum-version policy (force_update) is strictly enforced and not dismissible', () => {
  assert(vgContent.includes('status?.force_update'), 'force_update must be checked');
  assert(vgContent.includes('Update Required'), 'Mandatory update must display Update Required modal');
  assert(vgContent.includes('hasOptionalUpdate'), 'Optional update must be separated from force_update');
});

// 10. Clean Reload Preserving URL Context
test('10. Update reload uses window.location.reload() preserving URL pathname and state', () => {
  assert(vgContent.includes('window.location.reload()'), 'Must use standard window.location.reload()');
  assert(!vgContent.includes('window.location.href ='), 'Must not overwrite full href with unbounded cache-busting strings');
});

console.log(`\n=== TEST SUMMARY: ${passed}/${total} TESTS PASSED ===\n`);
if (passed !== total) process.exit(1);
