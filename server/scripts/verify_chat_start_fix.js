/**
 * server/scripts/verify_chat_start_fix.js
 * Verification script to test conversation initiation with newly registered users,
 * UUID/username/email resolution, self-healing profile provisioning, and self-chat guard.
 */

const supabase = require('../config/database');
const { ensureProfile } = require('../services/userService');
const chatController = require('../controllers/chatController');

async function runVerification() {
  console.log('=== VERIFYING CONVERSATION START & PROFILE PROVISIONING FIX ===\n');

  // Step 1: Create two test users in Supabase auth (simulating new users registered today)
  const user1Email = `test_chat_sender_${Date.now()}@notestandard.app`;
  const user2Email = `test_chat_recipient_${Date.now()}@notestandard.app`;
  const user1Username = `sender_${Math.floor(1000 + Math.random() * 9000)}`;
  const user2Username = `recipient_${Math.floor(1000 + Math.random() * 9000)}`;

  console.log(`Creating Sender user in Auth: ${user1Email} (@${user1Username})...`);
  const { data: user1Auth, error: u1Err } = await supabase.auth.admin.createUser({
    email: user1Email,
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { username: user1Username, full_name: 'Test Sender' }
  });

  if (u1Err) {
    console.error('Failed to create User 1:', u1Err.message);
    process.exit(1);
  }

  console.log(`Creating Recipient user in Auth (NO profile yet): ${user2Email} (@${user2Username})...`);
  const { data: user2Auth, error: u2Err } = await supabase.auth.admin.createUser({
    email: user2Email,
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { username: user2Username, full_name: 'Test Recipient' }
  });

  if (u2Err) {
    console.error('Failed to create User 2:', u2Err.message);
    process.exit(1);
  }

  const senderId = user1Auth.user.id;
  const recipientId = user2Auth.user.id;

  // Proactively delete recipient's profile if trigger automatically created it,
  // to explicitly test self-healing during conversation creation!
  await supabase.from('profiles').delete().eq('id', recipientId);
  console.log(`[Test] Deleted recipient profile for ${recipientId} to test on-the-fly self-healing provisioning.`);

  // Step 2: Test createConversation with Recipient UUID (user2Auth.user.id)
  console.log('\n--- Test 1: Start direct chat using Recipient User UUID ---');
  let resJson = null;
  let resStatus = 200;
  const reqMock1 = {
    user: { id: senderId, email: user1Email },
    body: { type: 'direct', participants: [recipientId] }
  };
  const resMock1 = {
    status: (s) => { resStatus = s; return resMock1; },
    json: (obj) => { resJson = obj; return obj; }
  };

  await chatController.createConversation(reqMock1, resMock1);
  console.log(`Response Status: ${resStatus}`);
  console.log(`Response Payload:`, resJson);

  if (resStatus !== 200 || !resJson?.conversation?.id) {
    console.error('FAILED Test 1: Could not start conversation using UUID!');
    process.exit(1);
  }
  console.log('PASSED Test 1: Conversation successfully created with missing recipient profile self-healed!');

  // Verify recipient profile was auto-created in public.profiles
  const { data: recipientProfile } = await supabase.from('profiles').select('*').eq('id', recipientId).maybeSingle();
  if (recipientProfile) {
    console.log(`PASSED Profile Verification: Recipient profile successfully auto-provisioned (@${recipientProfile.username}).`);
  } else {
    console.error('FAILED Profile Verification: Recipient profile still missing!');
    process.exit(1);
  }

  // Step 3: Test starting chat using Username
  console.log('\n--- Test 2: Start direct chat using Recipient Username ---');
  const reqMock2 = {
    user: { id: senderId, email: user1Email },
    body: { type: 'direct', participants: [user2Username] }
  };
  let resStatus2 = 200;
  let resJson2 = null;
  const resMock2 = {
    status: (s) => { resStatus2 = s; return resMock2; },
    json: (obj) => { resJson2 = obj; return obj; }
  };

  await chatController.createConversation(reqMock2, resMock2);
  console.log(`Response Status: ${resStatus2}`);
  console.log(`Is Existing Conversation: ${resJson2?.isExisting}`);

  if (resStatus2 !== 200 || !resJson2?.isExisting) {
    console.error('FAILED Test 2: Username resolution did not return existing direct chat!');
    process.exit(1);
  }
  console.log('PASSED Test 2: Existing direct conversation correctly matched via username!');

  // Step 4: Test Self-Chat Guard
  console.log('\n--- Test 3: Attempt starting direct chat with Self ---');
  const reqMock3 = {
    user: { id: senderId, email: user1Email },
    body: { type: 'direct', participants: [user1Username] }
  };
  let resStatus3 = 200;
  let resJson3 = null;
  const resMock3 = {
    status: (s) => { resStatus3 = s; return resMock3; },
    json: (obj) => { resJson3 = obj; return obj; }
  };

  await chatController.createConversation(reqMock3, resMock3);
  console.log(`Response Status: ${resStatus3}`);
  console.log(`Response Payload:`, resJson3);

  if (resStatus3 === 400 && resJson3?.error?.includes('yourself')) {
    console.log('PASSED Test 3: Self-chat correctly prevented with clear user-facing message.');
  } else {
    console.error('FAILED Test 3: Self-chat guard failed!');
    process.exit(1);
  }

  // Cleanup test resources
  console.log('\nCleaning up test conversations and users...');
  if (resJson?.conversation?.id) {
    await supabase.from('conversation_members').delete().eq('conversation_id', resJson.conversation.id);
    await supabase.from('conversations').delete().eq('id', resJson.conversation.id);
  }
  await supabase.from('profiles').delete().in('id', [senderId, recipientId]);
  await supabase.auth.admin.deleteUser(senderId);
  await supabase.auth.admin.deleteUser(recipientId);

  console.log('\n=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('Verification script unhandled error:', err);
  process.exit(1);
});
