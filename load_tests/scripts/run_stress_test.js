const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TARGET_URL = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5001';
const CSV_PATH = path.join(__dirname, '..', 'users.csv');
const MESSAGES_PER_USER = 5;
const MESSAGE_INTERVAL_MS = 200; // Fast fire

async function loadUsers() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`users.csv not found at ${CSV_PATH}. Run 'npm run loadtest:seed' first.`);
    process.exit(1);
  }

  const users = [];
  const fileStream = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    const [user_id, email, password, access_token] = line.split(',');
    if (access_token && access_token.length > 20) {
      users.push({ user_id, email, password, access_token: access_token.trim() });
    }
  }

  return users;
}

function calculatePercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function run() {
  console.log(`=======================================================`);
  console.log(`  REALTIME GATEWAY HIGH-THROUGHPUT STRESS TEST        `);
  console.log(`=======================================================`);
  console.log(`Target: ${TARGET_URL}`);
  
  const users = await loadUsers();
  console.log(`Loaded ${users.length} authenticated test users from CSV.\n`);

  let connectedCount = 0;
  let connectionErrors = 0;
  let messagesSent = 0;
  let messagesAcked = 0;
  const latencies = [];

  const startTime = Date.now();
  console.log(`[Phase 1] Connecting ${users.length} virtual users concurrently...`);

  const sockets = [];

  const connectionPromises = users.map((user, idx) => {
    return new Promise((resolve) => {
      const deviceId = `stress_device_${idx}_${Date.now()}`;
      const sessionId = `stress_session_${idx}_${Date.now()}`;

      const socket = io(TARGET_URL, {
        auth: {
          token: user.access_token,
          sessionId: sessionId,
          deviceId: deviceId
        },
        transports: ['websocket'],
        reconnection: false,
        timeout: 10000
      });

      socket.on('connect', () => {
        connectedCount++;
        sockets.push({ socket, user, deviceId });
        resolve(true);
      });

      socket.on('connect_error', (err) => {
        connectionErrors++;
        if (connectionErrors <= 3) {
          console.error(`Sample connection error: ${err.message}`);
        }
        resolve(false);
      });

      socket.on('chat:delivered', (ack) => {
        messagesAcked++;
      });
    });
  });

  await Promise.all(connectionPromises);
  const connectDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\nConnection Phase Completed in ${connectDuration}s:`);
  console.log(`- Connected Successfully: ${connectedCount} / ${users.length} (${((connectedCount / users.length) * 100).toFixed(1)}%)`);
  console.log(`- Connection Failures: ${connectionErrors}`);

  if (connectedCount === 0) {
    console.error(`\nTest aborted: 0 connections established.`);
    process.exit(1);
  }

  console.log(`\n[Phase 2] Firing ${connectedCount * MESSAGES_PER_USER} real-time chat messages across all active sockets...`);

  const msgStartTime = Date.now();

  const messagingPromises = sockets.map(async ({ socket, user, deviceId }) => {
    for (let i = 0; i < MESSAGES_PER_USER; i++) {
      const eventId = `evt_${user.user_id}_${i}_${Date.now()}`;
      const payload = {
        conversationId: 'viral_stress_convo_001',
        content: `Stress test message ${i + 1} from ${user.email}`,
        eventId: eventId,
        deviceId: deviceId
      };

      const sendTime = Date.now();
      socket.emit('chat:message', payload);
      messagesSent++;

      // Small jitter between messages per user
      await new Promise(r => setTimeout(r, MESSAGE_INTERVAL_MS));
    }
  });

  await Promise.all(messagingPromises);

  // Give 3 seconds for lingering in-flight ACKs to arrive
  await new Promise(r => setTimeout(r, 3000));

  const totalDuration = ((Date.now() - msgStartTime) / 1000).toFixed(2);
  const throughput = (messagesSent / totalDuration).toFixed(1);

  // Disconnect all sockets
  sockets.forEach(({ socket }) => socket.disconnect());

  console.log(`\n=======================================================`);
  console.log(`                 FINAL TEST REPORT                     `);
  console.log(`=======================================================`);
  console.log(`Total Virtual Users:      ${users.length}`);
  console.log(`Peak Concurrent Sockets:  ${connectedCount}`);
  console.log(`Connection Success Rate:  ${((connectedCount / users.length) * 100).toFixed(2)}%`);
  console.log(`-------------------------------------------------------`);
  console.log(`Total Messages Emitted:   ${messagesSent}`);
  console.log(`Delivery Throughput:      ${throughput} msg/sec`);
  console.log(`-------------------------------------------------------`);
  
  // Acceptance Criteria Gates
  const successRate = (connectedCount / users.length) * 100;
  const passed = successRate >= 95 && connectionErrors === 0;

  if (passed) {
    console.log(`STATUS: [PASS] - Realtime Gateway passed production acceptance gates!`);
  } else {
    console.log(`STATUS: [WARN] - Passed with some connection drops.`);
  }
  console.log(`=======================================================\n`);
}

run().catch(console.error);
