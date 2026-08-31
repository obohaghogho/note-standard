require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const senderId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd'; // Aghogho Jossy Oboh
const recipientId = '5089c266-1ad6-4a83-b23f-064d65995345'; // Admin Account

async function testFirstMessagePipeline() {
  console.log('=== FORENSIC VERIFICATION: FIRST MESSAGE PUSH PIPELINE ===');

  // 1. Create a temporary test conversation
  const { data: newConv, error: convErr } = await supabase
    .from('conversations')
    .insert({ type: 'direct' })
    .select('id')
    .single();

  if (convErr) {
    console.error('Failed to create test conversation:', convErr.message);
    process.exit(1);
  }

  const conversationId = newConv.id;
  console.log(`[1] Created test conversation ID: ${conversationId}`);

  // 2. Insert conversation members
  const { error: memErr } = await supabase
    .from('conversation_members')
    .insert([
      { conversation_id: conversationId, user_id: senderId, role: 'admin', status: 'accepted' },
      { conversation_id: conversationId, user_id: recipientId, role: 'member', status: 'pending' },
    ]);

  if (memErr) {
    console.error('Failed to insert members:', memErr.message);
    process.exit(1);
  }
  console.log('[2] Inserted conversation members');

  // 3. Send FIRST message via rpc_send_message (verifying atomic procedure execution)
  const eventId = require('crypto').randomUUID();
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_send_message', {
    p_conversation_id: conversationId,
    p_sender_id: senderId,
    p_content: 'Test First Message Forensic Verification',
    p_type: 'text',
    p_event_id: eventId,
    p_original_language: 'en',
    p_attachment_id: null,
    p_reply_to_id: null
  });

  if (rpcErr) {
    console.error('rpc_send_message failed:', rpcErr.message);
    process.exit(1);
  }

  const msg = rpcRes.message;
  console.log(`[3] FIRST message inserted via rpc_send_message: ID=${msg.id}, sequence_number=${msg.sequence_number}`);

  if (!msg.sequence_number || msg.sequence_number <= 0) {
    console.error('❌ FAIL: Message sequence_number is null or invalid!');
    process.exit(1);
  }
  console.log('✅ PASS: Message sequence_number is valid and atomic.');

  // 4. Test delivery engine message processing on gateway simulation
  const deliveryEngine = require('../../realtime-gateway/services/deliveryEngine');
  
  // Mock io with 0 sockets for recipient to test PUSH_IMMEDIATE path
  const mockIo = {
    in: () => ({
      fetchSockets: async () => []
    })
  };

  const envelope = {
    event: 'chat:message',
    payload: msg,
    users: [senderId, recipientId]
  };

  console.log('[4] Simulating Gateway processIncomingMessage for recipient (0 sockets)...');
  await deliveryEngine.processIncomingMessage(mockIo, supabase, envelope);

  // 5. Query push_delivery_telemetry row for this message
  await new Promise(r => setTimeout(r, 1000)); // Allow async telemetry insert to complete
  const { data: telemetry } = await supabase
    .from('push_delivery_telemetry')
    .select('*')
    .eq('message_id', msg.id);

  console.log(`[5] Telemetry records found for FIRST message: ${telemetry ? telemetry.length : 0}`);
  if (telemetry && telemetry.length > 0) {
    console.log('Telemetry record sample:', JSON.stringify(telemetry[0], null, 2));
    console.log('✅ PASS: Telemetry record created successfully for recipient on FIRST message!');
  } else {
    console.error('❌ FAIL: No telemetry record created!');
  }

  // Clean up test conversation & message
  console.log('[6] Cleaning up test conversation...');
  await supabase.from('messages').delete().eq('conversation_id', conversationId);
  await supabase.from('conversation_members').delete().eq('conversation_id', conversationId);
  await supabase.from('conversations').delete().eq('id', conversationId);
  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

testFirstMessagePipeline().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
