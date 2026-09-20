const supabase = require('../config/database');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testEditLifecycle() {
  console.log('=== TEST EDIT MESSAGE LIFECYCLE (WITHOUT IS_EDITED IN DB QUERY) ===');
  const convId = 'c53fd624-0d9b-4479-a7f5-b064fef186a4';
  const adminId = '5089c266-1ad6-4a83-b23f-064d65995345';

  // 1. Fetch current message count
  const { count: countBefore } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', convId);

  console.log(`1. Message count before edit: ${countBefore}`);

  // 2. Fetch the latest message from Admin in this conversation
  const { data: msgs } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .eq('sender_id', adminId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!msgs || msgs.length === 0) {
    console.error('No existing admin message found to edit!');
    return;
  }

  const origMsg = msgs[0];
  console.log(`2. Target message to edit: ID=${origMsg.id}, Content="${origMsg.content}"`);

  // 3. Simulate Edit API call (updating without is_edited column in DB query)
  const newContent = origMsg.content.includes('(edited)')
    ? origMsg.content.replace(' (edited)', '')
    : `${origMsg.content} (edited)`;
  
  console.log(`3. Applying edit: "${origMsg.content}" -> "${newContent}"`);

  const { data: updatedList, error: updateErr } = await supabase
    .from('messages')
    .update({
      content: newContent,
      updated_at: new Date().toISOString()
    })
    .eq('id', origMsg.id)
    .select('*');

  if (updateErr) {
    console.error('Update Error:', updateErr);
    return;
  }

  const updatedMsg = updatedList[0];
  console.log(`4. Update Result: ID=${updatedMsg.id}, Content="${updatedMsg.content}"`);

  // 4. Fetch message count after edit
  const { count: countAfter } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', convId);

  console.log(`5. Message count after edit: ${countAfter}`);

  console.log('\n--- VERIFICATION ASSERTIONS ---');
  console.log(`Assertion 1: Count unchanged? ${countBefore === countAfter} (${countBefore} vs ${countAfter})`);
  console.log(`Assertion 2: ID unchanged? ${origMsg.id === updatedMsg.id} (${origMsg.id} vs ${updatedMsg.id})`);
  console.log(`Assertion 3: Content updated? ${updatedMsg.content === newContent}`);
}

testEditLifecycle().catch(console.error);
