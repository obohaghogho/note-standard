/**
 * RECIPIENT BOT SERVICE
 * Keeps recipient_test@notestandard.com actively connected via socket.
 * Automatically emits chat:delivered (Delivery ACK) for incoming messages
 * while keeping messages UNREAD (Grey Double Tick stage).
 */

const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET;
const RECIPIENT_ID = 'fb579aae-a735-4c41-bebc-6a63042c2c00'; // recipient_test UUID

if (!JWT_SECRET) {
    console.error('JWT_SECRET environment variable is required.');
    process.exit(1);
}

function generateToken() {
    return jwt.sign({
        sub: RECIPIENT_ID,
        id: RECIPIENT_ID,
        email: 'recipient_test@notestandard.com',
        user_metadata: { full_name: 'Test Recipient' }
    }, JWT_SECRET, { expiresIn: '24h' });
}

function startBot() {
    const token = generateToken();
    console.log(`[RecipientBot] Starting socket connection to ${GATEWAY_URL} as recipient_test...`);

    const socket = io(GATEWAY_URL, {
        auth: { token, deviceId: 'recipient-bot-device', sessionId: 'recipient-bot-session' },
        transports: ['websocket'],
        reconnection: true
    });

    socket.on('connect', () => {
        console.log(`[RecipientBot] ✓ Connected to Gateway as recipient_test (socketId: ${socket.id})`);
    });

    socket.on('chat:message', (data) => {
        console.log(`[RecipientBot] 📩 Received incoming message ${data.id} from sender ${data.sender_id}`);
        console.log(`[RecipientBot] 📤 Emitting chat:delivered (Delivery ACK) to Gateway...`);
        
        socket.emit('chat:delivered', {
            conversationId: data.conversation_id,
            messageId: data.id,
            eventId: data.event_id,
            senderId: data.sender_id,
            deliveredAt: new Date().toISOString()
        });
    });

    socket.on('disconnect', (reason) => {
        console.warn(`[RecipientBot] ⚠ Disconnected (${reason}). Reconnecting...`);
    });
}

startBot();
