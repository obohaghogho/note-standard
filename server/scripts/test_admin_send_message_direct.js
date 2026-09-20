const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../config/database');

async function testSendMessage() {
  const convId = 'c53fd624-0d9b-4479-a7f5-b064fef186a4';
  const adminId = '5089c266-1ad6-4a83-b23f-064d65995345'; // onomejohn107@gmail.com
  const eventId = 'test-evt-' + Date.now();

  console.log('=== TESTING DB INSERT FOR ADMIN SEND MESSAGE ===');

  const validUuidEventId = require('crypto').randomUUID();
  const nonUuidEventId = 'temp-1726550123-abc';

  // 1. Test rpc_send_message with valid UUID
  try {
    console.log('\n--- Testing rpc_send_message with VALID UUID ---');
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_send_message', {
      p_conversation_id: convId,
      p_sender_id: adminId,
      p_content: 'Test message with valid UUID event_id',
      p_type: 'text',
      p_event_id: validUuidEventId,
      p_original_language: 'en',
      p_attachment_id: null,
      p_reply_to_id: null
    });
    if (rpcError) console.error('RPC Error:', rpcError);
    else console.log('RPC Success:', rpcData);
  } catch (err) {
    console.error('RPC Exception:', err);
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonUuidEventId);
  const safeEventId = isUuid ? nonUuidEventId : require('crypto').randomUUID();

  // Test insertPayload with original_language and safeEventId
  try {
    console.log('\n--- Testing Insert Payload with original_language and safeEventId ---');
    const insertPayload = {
      conversation_id: convId,
      sender_id: adminId,
      content: 'Hello William! Testing fixed message pipeline.',
      type: 'text',
      sentiment: null,
      original_language: 'en',
      event_id: safeEventId,
      sequence_number: null
    };
    const { data: insertData, error: insertError } = await supabase
      .from('messages')
      .insert([insertPayload])
      .select('*')
      .single();

    if (insertError) console.error('Insert Error:', insertError);
    else console.log('🎉 Insert SUCCESS:', insertData.id, insertData.content);
  } catch (err) {
    console.error('Insert Exception:', err);
  }

  // 4. Test updating conversations last_message_id
  try {
    console.log('\n--- Testing Conversations last_message_id update ---');
    const { data, error } = await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString()
      })
      .eq('id', convId)
      .select('*');
    if (error) console.error('Conversations Update Error:', error);
    else console.log('Conversations Update Success:', data);
  } catch (err) {
    console.error('Conversations Update Exception:', err);
  }
}

testSendMessage().catch(console.error);
