const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CARLY_ID = '4005e54f-5f05-47f5-97f8-8d0391fff9a4';
const JENNIFER_ID = 'a1134fbf-3054-4005-aaa3-b86382207106';

async function main() {
  console.log('--- Querying conversation_members for Carly and Jennifer G ---');
  const { data: members, error: mErr } = await supabase
    .from('conversation_members')
    .select('*')
    .in('user_id', [CARLY_ID, JENNIFER_ID]);

  console.log('Members found:', members, mErr);

  if (members && members.length > 0) {
    const convIds = [...new Set(members.map(m => m.conversation_id))];
    console.log('Conversation IDs:', convIds);

    // Find conversation details
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convIds);
    console.log('\n--- CONVERSATIONS DETAILS ---');
    console.table(convs);

    // Fetch all members of these conversations
    const { data: allConvMembers } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds);
    
    // Group members by conversation_id to see shared direct chats
    const convGroup = {};
    allConvMembers.forEach(cm => {
      if (!convGroup[cm.conversation_id]) convGroup[cm.conversation_id] = [];
      convGroup[cm.conversation_id].push(cm.user_id);
    });

    console.log('\n--- CONVERSATION MEMBERSHIPS ---');
    console.log(convGroup);

    // Fetch messages for all these conversations
    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });

    console.log(`\n====================================================`);
    console.log(`TOTAL MESSAGES IN CARLY/JENNIFER CONVERSATIONS: ${messages ? messages.length : 0}`);
    console.log(`====================================================\n`);

    if (messages && messages.length > 0) {
      messages.forEach((m, idx) => {
        const sender = m.sender_id === CARLY_ID ? 'Carly (CM1)' : (m.sender_id === JENNIFER_ID ? 'Jennifer G (jcwkgrenn54)' : m.sender_id);
        console.log(`[#${idx+1}] SentAt: ${m.created_at} | From: ${sender} | Conv: ${m.conversation_id}`);
        console.log(`     Status: [${m.delivery_status}] | ReadAt: ${m.read_at || 'UNREAD'} | DeliveredAt: ${m.delivered_at || 'NULL'}`);
        console.log(`     Content: "${m.content}"`);
        console.log('----------------------------------------------------');
      });
    }
  }
}

main().catch(console.error);
