/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');
const supportService = require('../server/services/supportService');
const adminController = require('../server/controllers/adminController');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyResolvedChatFix() {
  console.log('=== STEP 1: Finding a resolved support chat in DB ===');
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, support_status, chat_type, members:conversation_members(user_id)')
    .eq('chat_type', 'support')
    .eq('support_status', 'resolved')
    .limit(1);

  if (error || !convs || !convs.length) {
    console.log('No resolved support chat found to test. Test setup complete.');
    return;
  }

  const testConv = convs[0];
  console.log(`Testing Resolved Conversation ID: ${testConv.id} | Initial Status: ${testConv.support_status}`);

  // Test 1: Call getSupportChatForUser
  const userId = testConv.members?.[0]?.user_id;
  if (userId) {
    console.log(`\n--- Test 1: Fetching chat for user ${userId} ---`);
    const res = await supportService.getSupportChatForUser(userId);
    
    // Check DB status after fetch
    const { data: convAfterFetch } = await supabase
      .from('conversations')
      .select('support_status')
      .eq('id', testConv.id)
      .single();

    console.log(`Status after user fetch: '${convAfterFetch?.support_status}'`);
    if (convAfterFetch?.support_status === 'resolved') {
      console.log('✅ TEST 1 PASSED: Fetching resolved chat did NOT change support_status!');
    } else {
      console.error(`❌ TEST 1 FAILED: Status changed to '${convAfterFetch?.support_status}'!`);
    }
  }

  // Test 2: Call joinSupportChat as admin
  console.log(`\n--- Test 2: Simulating Admin joining/viewing resolved chat ---`);
  const req = {
    params: { id: testConv.id },
    user: { id: '5089c266-1ad6-4a83-b23f-064d65995345' }
  };
  let responseData = null;
  const resMock = {
    json: (data) => { responseData = data; return resMock; },
    status: () => resMock
  };

  await adminController.joinSupportChat(req, resMock);
  console.log('joinSupportChat Response:', responseData);

  const { data: convAfterJoin } = await supabase
    .from('conversations')
    .select('support_status')
    .eq('id', testConv.id)
    .single();

  console.log(`Status after admin join: '${convAfterJoin?.support_status}'`);
  if (convAfterJoin?.support_status === 'resolved') {
    console.log('✅ TEST 2 PASSED: Admin joining resolved chat did NOT change support_status to pending!');
  } else {
    console.error(`❌ TEST 2 FAILED: Status changed to '${convAfterJoin?.support_status}'!`);
  }
  console.log('--- ALL VERIFICATION TESTS FINISHED ---');
  process.exit(0);
}

verifyResolvedChatFix().catch((err) => {
  console.error(err);
  process.exit(1);
});
