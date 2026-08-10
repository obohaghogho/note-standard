/**
 * LIVE LOCALHOST END-TO-END AUTOMATED TEST
 * Connects to running Gateway (http://localhost:5001 or 3001) & API Server.
 * Simulates real Sender & Recipient devices to diagnose tick delivery receipt pipeline.
 */

const io = require('socket.io-client');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'c8bd3d17c329908dbb13a651fd95d4b431dfca1fc9dcaa0e2d2ed7a9686cb2d55bba8d09d1a435a313e3dfc915d87f9732bca0ba5d999ef542d6942ddddddf3c';

function generateToken(userId, email) {
    return jwt.sign({
        sub: userId,
        id: userId,
        email: email,
        user_metadata: { full_name: `Test User ${userId}` }
    }, JWT_SECRET, { expiresIn: '1h' });
}

async function findGatewayPort() {
    const ports = [5001, 3001, 5000];
    for (const port of ports) {
        try {
            const res = await axios.get(`http://localhost:${port}/health`, { timeout: 1000 }).catch(() => null);
            if (res) return `http://localhost:${port}`;
        } catch (e) {}
    }
    return 'http://localhost:5001';
}

async function runLocalhostTest() {
    console.log('=== STARTING LIVE LOCALHOST END-TO-END TEST ===\n');

    const gatewayUrl = await findGatewayPort();
    console.log(`Using Gateway URL: ${gatewayUrl}`);

    const senderId = '00000000-0000-4000-a000-000000000001';
    const recipientId = '00000000-0000-4000-a000-000000000002';
    const conversationId = '00000000-0000-4000-a000-000000000099';

    const senderToken = generateToken(senderId, 'sender@test.com');
    const recipientToken = generateToken(recipientId, 'recipient@test.com');

    console.log('1. Connecting Sender Socket to Gateway...');
    const senderSocket = io(gatewayUrl, {
        auth: { token: senderToken, deviceId: 'sender-device-1', sessionId: 'sender-session-1' },
        transports: ['websocket'],
        timeout: 3000
    });

    console.log('2. Connecting Recipient Socket to Gateway...');
    const recipientSocket = io(gatewayUrl, {
        auth: { token: recipientToken, deviceId: 'recipient-device-1', sessionId: 'recipient-session-1' },
        transports: ['websocket'],
        timeout: 3000
    });

    await Promise.all([
        new Promise((resolve, reject) => {
            senderSocket.on('connect', resolve);
            senderSocket.on('connect_error', (err) => reject(new Error(`Sender Socket Error: ${err.message}`)));
        }),
        new Promise((resolve, reject) => {
            recipientSocket.on('connect', resolve);
            recipientSocket.on('connect_error', (err) => reject(new Error(`Recipient Socket Error: ${err.message}`)));
        })
    ]);

    console.log(`✓ Sender Connected: socketId=${senderSocket.id}`);
    console.log(`✓ Recipient Connected: socketId=${recipientSocket.id}\n`);

    let senderReceivedDeliveryAck = false;
    let deliveredPayload = null;

    senderSocket.on('chat:message_delivered', (data) => {
        console.log('✅ [SENDER] Received chat:message_delivered receipt:', data);
        senderReceivedDeliveryAck = true;
        deliveredPayload = data;
    });

    const testMessageId = `msg-test-${Date.now()}`;
    const testEventId = `evt-test-${Date.now()}`;

    console.log('3. Recipient emitting chat:delivered ACK to Gateway...');
    recipientSocket.emit('chat:delivered', {
        conversationId,
        messageId: testMessageId,
        eventId: testEventId,
        senderId,
        deliveredAt: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('\n--- LOCALHOST TEST RESULTS ---');
    console.log(`Sender Received Delivery ACK via user:${senderId} room: ${senderReceivedDeliveryAck ? 'YES ✅' : 'NO ❌'}`);
    if (deliveredPayload) {
        console.log('Payload Received by Sender:', deliveredPayload);
    }

    senderSocket.disconnect();
    recipientSocket.disconnect();

    if (!senderReceivedDeliveryAck) {
        console.error('\n❌ LOCALHOST TEST FAILED: Gateway failed to route chat:message_delivered to sender!');
        process.exit(1);
    } else {
        console.log('\n🎉 LOCALHOST TEST PASSED 100% CLEANLY ON LOCALHOST!');
    }
}

runLocalhostTest().catch(err => {
    console.error('Test Exception:', err.message);
    process.exit(1);
});
