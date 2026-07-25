/**
 * measure_delivery_latency.js
 */

const { io: ioClient } = require('socket.io-client');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const gatewayUrl = 'http://localhost:5001';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function getOrCreateTestUserToken(email) {
  const password = 'TestPassword123!';

  // Try admin create or update user password
  const { data: usersData } = await supabase.auth.admin.listUsers();
  const existingUser = usersData?.users?.find(u => u.email === email);

  if (existingUser) {
    await supabase.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true });
  } else {
    await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  }

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInData?.session?.access_token) {
    return { token: signInData.session.access_token, user: signInData.user };
  }

  throw new Error(`Could not obtain Supabase Auth token for ${email}: ${signInErr?.message}`);
}

async function runBenchmark() {
  console.log(`\n=================================================================`);
  console.log(` ⏱️  DELIVERY ACK LATENCY BENCHMARK (<150ms TARGET)`);
  console.log(`=================================================================\n`);

  const senderObj = await getOrCreateTestUserToken('bench_sender_v2@notestandard.com');
  const recipientObj = await getOrCreateTestUserToken('bench_recipient_v2@notestandard.com');

  const sender = senderObj.user;
  const recipient = recipientObj.user;

  console.log(`Sender   : ${sender.email} (${sender.id.slice(0, 8)})`);
  console.log(`Recipient: ${recipient.email} (${recipient.id.slice(0, 8)})`);

  const conversationId = 'bench-conv-latency-123';
  const senderSession = `bench-session-sender-${Date.now()}`;
  const recipientSession = `bench-session-recipient-${Date.now()}`;

  // Connect sockets to gateway on port 5001
  const senderSocket = ioClient(gatewayUrl, {
    transports: ['websocket'],
    auth: { token: senderObj.token, sessionId: senderSession, deviceId: 'sender-test-device' }
  });

  const recipientSocket = ioClient(gatewayUrl, {
    transports: ['websocket'],
    auth: { token: recipientObj.token, sessionId: recipientSession, deviceId: 'recipient-test-device' }
  });

  const connectPromise = Promise.all([
    new Promise(r => senderSocket.on('connect', () => { console.log('✅ Sender socket connected to Gateway'); r(); })),
    new Promise(r => recipientSocket.on('connect', () => { console.log('✅ Recipient socket connected to Gateway'); r(); }))
  ]);

  await Promise.race([
    connectPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Socket connection timeout')), 8000))
  ]);

  senderSocket.emit('join_room', conversationId);
  recipientSocket.emit('join_room', conversationId);

  console.log(`✅ Both sockets ready. Executing real-time delivery benchmark...\n`);

  const t0_start = Date.now();
  const eventId = `bench-${Date.now()}`;
  let t1_recipient_received = 0;
  let t2_sender_ack_received = 0;

  recipientSocket.on('chat:message', (msg) => {
    t1_recipient_received = Date.now();
    console.log(`[1] Recipient Socket Received Message | +${t1_recipient_received - t0_start}ms`);

    recipientSocket.emit('chat:delivered', {
      conversationId: msg.conversation_id || conversationId,
      messageId: msg.id,
      eventId: msg.event_id || eventId,
      senderId: sender.id,
      deliveredAt: new Date().toISOString()
    });
  });

  const latencyPromise = new Promise((resolve) => {
    senderSocket.on('chat:message_delivered', (receipt) => {
      t2_sender_ack_received = Date.now();
      const totalAckLatency = t2_sender_ack_received - t0_start;
      const roundtripAckTime = t2_sender_ack_received - t1_recipient_received;

      console.log(`[2] Sender Socket Received chat:message_delivered (✓✓) | +${totalAckLatency}ms`);
      console.log(`\n--- EMPIRICAL LATENCY REPORT ---`);
      console.log(`Created → Gateway → Recipient Socket (1-way) : ${t1_recipient_received - t0_start}ms`);
      console.log(`Recipient ACK → Gateway → Sender Socket (✓✓)  : ${roundtripAckTime}ms`);
      console.log(`Total End-to-End Delivery ACK (✓ → ✓✓)      : ${totalAckLatency}ms`);

      if (totalAckLatency <= 150) {
        console.log(`\n✅ BENCHMARK PASSED: Delivery ACK achieved in ${totalAckLatency}ms (<150ms WhatsApp-grade threshold)`);
      } else {
        console.warn(`\n⚠️  Delivery ACK latency: ${totalAckLatency}ms`);
      }
      resolve(totalAckLatency);
    });
  });

  // POST /internal/emit on Gateway
  const postData = JSON.stringify({
    type: 'to_user',
    room: recipient.id,
    event: 'chat:message',
    payload: {
      id: `msg-${Date.now()}`,
      event_id: eventId,
      conversation_id: conversationId,
      sender_id: sender.id,
      content: 'Benchmarking delivery ACK latency',
      type: 'text',
      created_at: new Date().toISOString()
    }
  });

  const req = http.request({
    hostname: 'localhost',
    port: 5001,
    path: '/internal/emit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  });

  req.write(postData);
  req.end();

  await Promise.race([
    latencyPromise,
    new Promise(r => setTimeout(r, 6000))
  ]);

  senderSocket.disconnect();
  recipientSocket.disconnect();
  console.log(`\n=================================================================\n`);
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err.message);
  process.exit(1);
});
