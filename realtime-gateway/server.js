/**
 * Realtime Gateway — NoteStandard
 * 
 * Architecture:
 *   - Socket.IO on port 5000 (chat, wallet, presence, call signaling)
 *   - PeerJS on port 9000 (WebRTC peer discovery — MUST be isolated)
 *
 * Why separate ports?
 *   PeerJS's `ExpressPeerServer` creates its own internal WebSocket server.
 *   When attached to the same httpServer as Socket.IO, it hijacks the
 *   HTTP `upgrade` event, corrupting Socket.IO's WebSocket frames 
 *   ("Invalid frame header"). Separate ports is the only reliable fix.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const { authMiddleware } = require('./auth');
const cors = require('cors');
const redis = require('redis');
require('dotenv').config();

// Global Error Handlers for Stability
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ═══════════════════════════════════════════════════════════════
//  1. SOCKET.IO GATEWAY (Port 5000 - Chat, Signaling, Wallet)
// ═══════════════════════════════════════════════════════════════
const app = express();

app.use(cors({
  origin: [
    'https://notestandard.com',
    'https://www.notestandard.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

const httpServer = http.createServer(app);

// Initialize IO and capture its upgrade listener immediately
const io = new Server(httpServer, {
  cors: {
    origin: [
      'https://notestandard.com',
      'https://www.notestandard.com',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  perMessageDeflate: false, // Core fix for shared-port frame corruption
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

const ioUpgradeListeners = httpServer.listeners('upgrade').slice();
httpServer.removeAllListeners('upgrade');
console.log(`[Gateway] Captured ${ioUpgradeListeners.length} Socket.io upgrade listeners`);

io.use(authMiddleware);

// Load event handlers
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

// ─── Redis Subscriber ────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  const subscriber = redis.createClient({ url: REDIS_URL });
  subscriber.on('error', (err) => console.error('[Redis] Subscriber Error:', err));
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
      } catch (err) {
        console.error('[Redis] Failed to process message:', err.message);
      }
    });
  }).catch(err => {
    console.error('[Redis] Connection failed:', err.message);
  });
}

// ─── HTTP Bridge & Health ───────────────────────────────────────
app.post('/internal/emit', (req, res) => {
  const { event, data } = req.body;
  if (!event || !data) return res.status(400).json({ error: 'Missing event or data' });
  switch (event) {
    case 'to_user': io.to(`user:${data.userId}`).emit(data.event, data.data); break;
    case 'to_conversation': io.to(data.conversationId).emit(data.event, data.data); break;
    case 'to_admin': io.to('admin_room').emit(data.event, data.data); break;
    case 'broadcast': io.emit(data.event, data.data); break;
    default: res.status(400).json({ error: 'Invalid event type' }); return;
  }
  res.json({ ok: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'realtime-gateway', socketClients: io.engine.clientsCount });
});

// ═══════════════════════════════════════════════════════════════
//  2. PEERJS SERVER (Integrated with Main port for Production)
// ═══════════════════════════════════════════════════════════════
const peerHandler = ExpressPeerServer(httpServer, {
  debug: false,
  path: '/',
  allow_discovery: false,
  proxied: true,
});

app.use('/peerjs', peerHandler);

const peerUpgradeListeners = httpServer.listeners('upgrade').slice();
httpServer.removeAllListeners('upgrade');
console.log(`[Gateway] Captured ${peerUpgradeListeners.length} PeerJS upgrade listeners`);

// Final Deterministic Upgrade Dispatcher
httpServer.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url.includes('/socket.io/')) {
    ioUpgradeListeners.forEach(listener => listener(req, socket, head));
  } else if (url.includes('/peerjs')) {
    peerUpgradeListeners.forEach(listener => listener(req, socket, head));
  } else {
    console.log(`[Gateway] Rejecting unknown upgrade request: ${url}`);
    socket.destroy();
  }
});

peerHandler.on('connection', (client) => {
  console.log(`[PeerJS] ✓ Peer connected: ${client.getId()}`);
});

peerHandler.on('disconnect', (client) => {
  console.log(`[PeerJS] ✗ Peer disconnected: ${client.getId()}`);
});

// ─── Start Universal Server ─────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Gateway] ✓ Universal Gateway active on port ${PORT}`);
    console.log(`[Gateway]   - Socket.IO: http://0.0.0.0:${PORT}`);
    console.log(`[Gateway]   - PeerJS: http://0.0.0.0:${PORT}/peerjs`);
});

