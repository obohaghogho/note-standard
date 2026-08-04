/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepAuditAghoghoSupport() {
  const aghoghoId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';

  console.log('=== STEP 1: Find all support conversations for Aghogho ===');
  const { data: members } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', aghoghoId);

  const convIds = (members || []).map(m => m.conversation_id);

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .in('id', convIds)
    .eq('chat_type', 'support')
    .order('updated_at', { ascending: false });

  console.log(`Found ${conversations?.length || 0} support conversations for Aghogho:`);

  for (const conv of (conversations || [])) {
    console.log(`\n==================================================`);
    console.log(`Support Conv ID: ${conv.id}`);
    console.log(`Name: ${conv.name}`);
    console.log(`Support Status: ${conv.support_status}`);
    console.log(`Created: ${conv.created_at} | Updated: ${conv.updated_at}`);

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    console.log(`Messages count: ${msgs?.length || 0}`);
    if (msgs && msgs.length > 0) {
      msgs.forEach((m, idx) => {
        console.log(`  [#${idx + 1}] ID:${m.id.slice(0, 8)} | Sender:${m.sender_id === aghoghoId ? 'AGHOGHO' : m.sender_id.slice(0, 8)} (${m.sender_type || 'user'}) | Time:${m.created_at.slice(0, 19)}`);
        console.log(`       Content: "${m.content}"`);
      });
    }
  }

  console.log('\n=== STEP 2: Find any messages sent by Aghogho containing "support" or sent in support chats ===');
  const { data: userMsgs } = await supabase
    .from('messages')
    .select('id, conversation_id, content, created_at, sender_type')
    .eq('sender_id', aghoghoId)
    .order('created_at', { ascending: false })
    .limit(30);

  console.log('Latest 30 messages sent by Aghogho overall:');
  userMsgs?.forEach((m, i) => {
    console.log(`  #${i+1} Conv:${m.conversation_id.slice(0, 8)} | Time:${m.created_at} | Content: "${m.content}"`);
  });
}

deepAuditAghoghoSupport().catch(console.error);
