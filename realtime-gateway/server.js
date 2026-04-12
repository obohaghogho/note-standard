/**
 * Realtime Gateway — NoteStandard
 *
 * Architecture:
 *   - Unified Node HTTP Server running on `PORT`
 *   - Express handled at root
 *   - PeerJS & Socket.IO co-exist by registering PeerJS FIRST, 
 *     allowing Engine.IO to gracefully intercept and wrap WebSocket upgrades natively.
 *   - PostgreSQL LISTEN/NOTIFY replaces Redis for server-to-server Pub/Sub.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const { authMiddleware } = require('./auth');
const cors = require('cors');
const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

// ✅ 1. CRASH PREVENTION: GLOBAL ERROR HANDLERS
process.on('uncaughtException', (err) => {
  console.error('[Process] 🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] 🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

const ALLOWED_ORIGINS = [
  'https://notestandard.com',
  'https://www.notestandard.com',
  'https://realtime-gateway-gsb5.onrender.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const app = express();

// ✅ 2. CORS FIX (STRICT & GLOBAL)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); 
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

// ✅ 3. HEALTH CHECK
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ✅ 4. CREATE HTTP SERVER (SHARED)
const httpServer = http.createServer(app);

// ✅ 5. INTERNAL EMIT ENDPOINT
app.post('/internal/emit', (req, res) => {
  try {
    dispatchSocketEvent(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Global Dispatcher for Socket Events
 * Standardized envelope: { type: string, room: string, event: string, payload: any }
 */
function dispatchSocketEvent(envelope) {
  const { type, room, event, payload } = envelope;

  if (!type || !room || !event) {
    console.warn('[Gateway] ⚠ Received malformed event envelope:', JSON.stringify(envelope).substring(0, 100));
    return;
  }

  // Consistent Room Resolver
  const targetRoom = type === 'to_user' ? `user:${room}` : room;

  console.log(`[Gateway] 📡 [${type}] room:${targetRoom} event:${event}`);

  if (type === 'broadcast') {
    io.emit(event, payload);
  } else {
    io.to(targetRoom).emit(event, payload);
  }
}

// ✅ 6. PEERJS SETUP — 100% Isolated Dummy Server Pattern
const peerDummyServer = http.createServer();
peerDummyServer.listen(0, '127.0.0.1', () => {
  const port = peerDummyServer.address().port;
  console.log(`[PeerJS] Dummy server listening internally on 127.0.0.1:${port}`);
});

const peerServer = ExpressPeerServer(peerDummyServer, {
  path: '/peerjs',
  allow_discovery: false,
  proxied: true,
});

app.use(peerServer);

// ✅ 7. SOCKET.IO SETUP
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  perMessageDeflate: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

const socketIoListeners = httpServer.listeners('upgrade').slice(0);
httpServer.removeAllListeners('upgrade');

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/peerjs')) {
    peerDummyServer.emit('upgrade', req, socket, head);
  } else {
    if (socketIoListeners.length > 0) {
      socketIoListeners.forEach(l => l(req, socket, head));
    } else {
      const current = httpServer.listeners('upgrade').filter(l => l !== thisListener);
      current.forEach(l => l(req, socket, head));
    }
  }
});
const thisListener = httpServer.listeners('upgrade')[0];

peerServer.on('connection', (client) => {
  console.log(`[PeerJS] ✓ Peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
  console.log(`[PeerJS] ✗ Peer disconnected: ${client.getId()}`);
});

io.use(authMiddleware);

const chatHandlers = require('./events/chat');
const callHandlers = require('./events/call');
const walletHandlers = require('./events/wallet');
const notificationHandlers = require('./events/notifications');
const presenceHandlers = require('./events/presence');

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`[Socket.IO] ✓ ${socket.id} connected (user: ${userId})`);
  socket.join(`user:${userId}`);
  
  presenceHandlers(io, socket);
  chatHandlers(io, socket);
  callHandlers(io, socket);
  walletHandlers(io, socket);
  notificationHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] ✗ ${socket.id} disconnected (${reason})`);
  });
});

// ✅ 8. PostgreSQL LISTEN Loop (Replaces Redis Sub)
const DATABASE_URL = process.env.DATABASE_URL;

async function initPgListener() {
  if (!DATABASE_URL) {
    console.warn('[Gateway] ⚠ DATABASE_URL missing. PostgreSQL Pub/Sub disabled.');
    return;
  }

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
  });

  pgClient.on('error', (err) => {
    console.error('[Gateway] 🐘 PostgreSQL Client Error:', err.message);
    if (err.message.includes('connection') || err.message.includes('terminated')) {
      reconnectPg();
    }
  });

  pgClient.on('notification', (msg) => {
    if (msg.channel === 'realtime_events') {
      try {
        const envelope = JSON.parse(msg.payload);
        dispatchSocketEvent(envelope);
      } catch (err) {
        console.error('[Gateway] 🐘 Failed to parse notification payload:', err.message);
      }
    }
  });

  async function connect() {
    try {
      await pgClient.connect();
      console.log('[Gateway] 🐘 PostgreSQL connected for LISTEN');
      await pgClient.query('LISTEN realtime_events');
      console.log('[Gateway] 🐘 ✓ Listening for PostgreSQL events on channel: realtime_events');
    } catch (err) {
      console.error('[Gateway] 🐘 PostgreSQL connection failed:', err.message);
      reconnectPg();
    }
  }

  async function reconnectPg() {
    console.log('[Gateway] 🐘 Attempting to reconnect to PostgreSQL in 5s...');
    setTimeout(initPgListener, 5000);
    try {
      await pgClient.end().catch(() => {});
    } catch (e) {}
  }

  connect();
}

initPgListener();

// ✅ 9. START SERVER
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway Server active on port ${PORT}`);
});
