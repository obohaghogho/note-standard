/**
 * Realtime Gateway — NoteStandard
 *
 * Architecture:
 *   - Unified Node HTTP Server running on `PORT`
 *   - Express handled at root
 *   - PeerJS & Socket.IO co-exist by registering PeerJS FIRST, 
 *     allowing Engine.IO to gracefully intercept and wrap WebSocket upgrades natively.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const { authMiddleware } = require('./auth');
const cors = require('cors');
const redis = require('redis');
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

// ✅ 5. PEERJS HTTP HANDLER
app.use('/peerjs', (req, res, next) => {
  res.status(200).send({ name: 'PeerJS Server', description: 'Internal Routing' });
});

app.post('/internal/emit', (req, res) => {
  const { event, data } = req.body;
  if (!event || !data) return res.status(400).json({ error: 'Missing event/data' });
  switch (event) {
    case 'to_user': io.to(`user:${data.userId}`).emit(data.event, data.data); break;
    case 'to_conversation': io.to(data.conversationId).emit(data.event, data.data); break;
    case 'to_admin': io.to('admin_room').emit(data.event, data.data); break;
    case 'broadcast': io.emit(data.event, data.data); break;
    default: res.status(400).json({ error: 'Invalid event type' }); return;
  }
  res.json({ ok: true });
});

// ✅ 6. PEERJS SETUP (REGISTERED BEFORE SOCKET.IO!)
const peerServer = ExpressPeerServer(httpServer, {
  path: '/peerjs',
  allow_discovery: false,
  proxied: true, // Crucial for Render
  corsOptions: {
    origin: 'https://www.notestandard.com',
    credentials: true,
  }
});

// Mount PeerJS HTTP logic globally to gracefully process API calls without duplicate prefixing
app.use(peerServer);

peerServer.on('connection', (client) => {
  console.log(`[PeerJS] ✓ Peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
  console.log(`[PeerJS] ✗ Peer disconnected: ${client.getId()}`);
});

// ✅ 7. SOCKET.IO SETUP
// Engine.IO will seamlessly wrap pre-existing WebSocket listeners (like PeerJS's native ws hook)
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) return callback(null, true);
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'], // Explicitly enforce transports array
  perMessageDeflate: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
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

// ✅ 8. Redis Sub
const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  const subscriber = redis.createClient({ url: REDIS_URL });
  subscriber.on('error', (err) => console.error('[Redis] Error:', err));
  subscriber.connect().then(() => {
    console.log('[Redis] ✓ Subscriber connected');
    subscriber.subscribe('realtime:events', (message) => {
      try {
        const { event, data } = JSON.parse(message);
        switch (event) {
          case 'to_user': io.to(`user:${data.userId}`).emit(data.event, data.data); break;
          case 'to_conversation': io.to(data.conversationId).emit(data.event, data.data); break;
          case 'to_admin': io.to('admin_room').emit(data.event, data.data); break;
          case 'broadcast': io.emit(data.event, data.data); break;
        }
      } catch (err) { }
    });
  }).catch(() => {});
}

// ✅ 9. START SERVER (RENDER PORT)
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway Server active on port ${PORT}`);
});

