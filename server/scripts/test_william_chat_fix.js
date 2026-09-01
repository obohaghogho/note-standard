const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const chatController = require('../controllers/chatController');

async function testWilliamChatFix() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    const convId = 'bfed3623-37ea-45ff-8af7-17695aeb4d0f';
    const adminId = '5089c266-1ad6-4a83-b23f-064d65995345';
    const williamId = '587b4497-1ab9-4293-b986-d60e0d1422d9';

    console.log('=== TESTING WILLIAM CHAT FIX ===\n');

    // 1. Verify DB state for conversation bfed3623-37ea-45ff-8af7-17695aeb4d0f
    const cmRes = await client.query(
      `SELECT user_id, cleared_at, is_deleted FROM conversation_members WHERE conversation_id = $1`,
      [convId]
    );
    console.log('[1] DB Membership State:');
    cmRes.rows.forEach(r => console.log(` - User: ${r.user_id} | cleared_at: ${r.cleared_at} | is_deleted: ${r.is_deleted}`));

    // 2. Fetch messages in conversation
    const msgRes = await client.query(
      `SELECT id, content, created_at, is_deleted FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC`,
      [convId]
    );
    console.log(`\n[2] Messages in DB (${msgRes.rows.length}):`);
    msgRes.rows.forEach(m => console.log(` - Content: "${m.content}" | CreatedAt: ${m.created_at}`));

    // 3. Simulate calling startDirectChat via mock req/res
    const req = {
      user: { id: adminId },
      body: { participantIds: [williamId], type: 'direct' }
    };
    let responseData = null;
    const res = {
      json: (data) => { responseData = data; return res; },
      status: (code) => res
    };

    console.log('\n[3] Executing createConversation (startDirectChat)...');
    await chatController.createConversation(req, res);
    console.log('API Response:', responseData?.isExisting ? 'Existing Conversation Returned' : 'New Conversation');

    // 4. Verify cleared_at AFTER startDirectChat
    const cmResAfter = await client.query(
      `SELECT user_id, cleared_at, is_deleted FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [convId, adminId]
    );
    console.log('\n[4] Admin Membership State AFTER startDirectChat:');
    console.log(` - cleared_at: ${cmResAfter.rows[0].cleared_at} (Should be NULL!)`);
    console.log(` - is_deleted: ${cmResAfter.rows[0].is_deleted}`);

    if (cmResAfter.rows[0].cleared_at === null) {
      console.log('\n🎉 SUCCESS: cleared_at is NULL! The active chat history will NEVER be wiped when searching/clicking a user!');
    } else {
      console.error('\n❌ FAILURE: cleared_at was modified!');
    }

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await client.end();
  }
}

testWilliamChatFix();
