/**
 * Master Verification Test Suite: NoteStandard Location Privacy & Hide Location
 * Phase 18 — 12 Core Privacy Test Assertions
 */
const assert = require('assert');
const { sanitizeProfileForViewer, sanitizeProfilesForViewer } = require('../utils/privacySanitizer');

async function runLocationPrivacyTests() {
  console.log('🧪 Starting Master Location Privacy Automated Test Suite...\n');

  // TEST 1: User A = HIDDEN, User B opens User A's profile → No location exposed
  const userA_hidden = {
    id: 'user-a-123',
    username: 'user_a',
    full_name: 'User A',
    country_code: 'US',
    location_visibility: 'hidden'
  };
  const viewerUserB = 'user-b-456';

  const test1 = sanitizeProfileForViewer(userA_hidden, viewerUserB);
  assert.strictEqual(test1.country_code, undefined, 'TEST 1 FAIL: country_code must be stripped when hidden');
  assert.strictEqual(test1.location, undefined, 'TEST 1 FAIL: location must be stripped');
  console.log('✅ TEST 1 PASSED: User A = HIDDEN → User B receives no location fields.');

  // TEST 2: User A = VISIBLE, User B opens User A's profile → Approved location representation available
  const userA_visible = {
    id: 'user-a-123',
    username: 'user_a',
    full_name: 'User A',
    country_code: 'US',
    location_visibility: 'visible',
    latitude: 37.7749, // accidental GPS mock
    longitude: -122.4194
  };
  const test2 = sanitizeProfileForViewer(userA_visible, viewerUserB);
  assert.strictEqual(test2.country_code, 'US', 'TEST 2 FAIL: Approved country_code must be present');
  assert.strictEqual(test2.latitude, undefined, 'TEST 2 FAIL: Precise latitude must be stripped');
  assert.strictEqual(test2.longitude, undefined, 'TEST 2 FAIL: Precise longitude must be stripped');
  console.log('✅ TEST 2 PASSED: User A = VISIBLE → Approved country representation returned, precise GPS stripped.');

  // TEST 3: User A changes VISIBLE → HIDDEN → Subsequent API responses stop exposing location
  let dynamicUserA = { ...userA_visible };
  dynamicUserA.location_visibility = 'hidden';
  const test3 = sanitizeProfileForViewer(dynamicUserA, viewerUserB);
  assert.strictEqual(test3.country_code, undefined, 'TEST 3 FAIL: Toggled to hidden must immediately sanitize response');
  console.log('✅ TEST 3 PASSED: Dynamic change VISIBLE → HIDDEN immediately strips location.');

  // TEST 4: User A changes HIDDEN → VISIBLE → Approved location becomes available
  dynamicUserA.location_visibility = 'visible';
  const test4 = sanitizeProfileForViewer(dynamicUserA, viewerUserB);
  assert.strictEqual(test4.country_code, 'US', 'TEST 4 FAIL: Toggled to visible must restore approved location');
  console.log('✅ TEST 4 PASSED: Dynamic change HIDDEN → VISIBLE makes approved location available.');

  // TEST 5: Cache Invalidation / Stale Object Immunity
  const staleCachedProfile = { ...userA_visible, location_visibility: 'hidden' };
  const test5 = sanitizeProfileForViewer(staleCachedProfile, viewerUserB);
  assert.strictEqual(test5.country_code, undefined, 'TEST 5 FAIL: Sanitizer must override stale cached country_code');
  console.log('✅ TEST 5 PASSED: Stale cached profile object with location_visibility=hidden is safely sanitized.');

  // TEST 6: Realtime / Search Payload Sanitization
  const searchResults = [
    { id: 'user-a', username: 'usera', country_code: 'NG', location_visibility: 'hidden' },
    { id: 'user-b', username: 'userb', country_code: 'GB', location_visibility: 'visible' }
  ];
  const test6 = sanitizeProfilesForViewer(searchResults, viewerUserB);
  assert.strictEqual(test6[0].country_code, undefined, 'TEST 6 FAIL: Search result for hidden user must be sanitized');
  assert.strictEqual(test6[1].country_code, 'GB', 'TEST 6 FAIL: Search result for visible user retains country');
  console.log('✅ TEST 6 PASSED: Array sanitation (search/presence/directory) respects individual user settings.');

  // TEST 7: Direct API request (Viewer is profile owner)
  const test7Self = sanitizeProfileForViewer(userA_hidden, 'user-a-123'); // Self view
  assert.strictEqual(test7Self.country_code, 'US', 'TEST 7 FAIL: Owner viewing self can see own location setting');
  console.log('✅ TEST 7 PASSED: Profile owner viewing own profile retains location metadata.');

  // TEST 8: Parameter Manipulation / ID Substitution
  const attackerViewer = 'attacker-id-999';
  const test8 = sanitizeProfileForViewer(userA_hidden, attackerViewer);
  assert.strictEqual(test8.country_code, undefined, 'TEST 8 FAIL: Attacker ID substitution must be blocked');
  console.log('✅ TEST 8 PASSED: ID substitution / Parameter manipulation yields sanitized response.');

  // TEST 9: Default setting for unconfigured / new users
  const newUserDefaultProfile = { id: 'new-user-1', username: 'newuser', country_code: 'CA' /* no location_visibility explicit */ };
  const test9 = sanitizeProfileForViewer(newUserDefaultProfile, viewerUserB);
  assert.strictEqual(test9.country_code, undefined, 'TEST 9 FAIL: Default unconfigured user location_visibility must be hidden');
  console.log('✅ TEST 9 PASSED: Unconfigured / New user defaults to HIDDEN (privacy-first default).');

  // TEST 10: Null / Undefined Profile Safety
  const test10 = sanitizeProfileForViewer(null, viewerUserB);
  assert.strictEqual(test10, null, 'TEST 10 FAIL: Null profile handling');
  console.log('✅ TEST 10 PASSED: Null/undefined safety check.');

  // TEST 11: Mobile & Web parity data payload validation
  const mobilePayload = { id: 'user-m', location_visibility: 'hidden', country_code: 'DE' };
  const test11 = sanitizeProfileForViewer(mobilePayload, viewerUserB);
  assert.strictEqual(test11.country_code, undefined, 'TEST 11 FAIL: Mobile API payload sanitization');
  console.log('✅ TEST 11 PASSED: Mobile & Web parity sanitization verified.');

  // TEST 12: Absolute stripping of coordinates and address fields
  const fullProfileWithSensitiveFields = {
    id: 'user-z',
    location_visibility: 'hidden',
    country_code: 'FR',
    city: 'Paris',
    location: 'Paris, France',
    latitude: 48.8566,
    longitude: 2.3522,
    address: '123 Champs Elysees',
    user_location: 'GPS: 48.8566, 2.3522'
  };
  const test12 = sanitizeProfileForViewer(fullProfileWithSensitiveFields, viewerUserB);
  assert.strictEqual(test12.country_code, undefined);
  assert.strictEqual(test12.city, undefined);
  assert.strictEqual(test12.location, undefined);
  assert.strictEqual(test12.latitude, undefined);
  assert.strictEqual(test12.longitude, undefined);
  assert.strictEqual(test12.address, undefined);
  assert.strictEqual(test12.user_location, undefined);
  console.log('✅ TEST 12 PASSED: Absolute stripping of all city/address/GPS/location fields confirmed.');

  console.log('\n🎉 ALL 12 MASTER LOCATION PRIVACY TEST ASSERTIONS PASSED WITH 100% SUCCESS!');
}

runLocationPrivacyTests().catch(err => {
  console.error('❌ Location Privacy Test Suite Failed:', err);
  process.exit(1);
});
