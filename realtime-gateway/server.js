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
const ALLOWED_ORIGINS = [
  'https://notestandard.com',
  'https://www.notestandard.com',
  'https://realtime-gateway-gsb5.onrender.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
];

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow any local network IP in dev
    if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for dev — lock down in production via environment check
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

const httpServer = http.createServer(app);

// Initialize IO and capture its upgrade listener immediately
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'], // polling first for reliability, upgrades to ws
  perMessageDeflate: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});


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
//  2. PEERJS SERVER — Dual Mode
//   Dev:  Isolated on PEER_PORT (9000) — avoids WS frame corruption
//   Prod: Mounted on the main httpServer at /peerjs (Render single-port)
// ═══════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT) || 5000;
const PEER_PORT = parseInt(process.env.PEER_PORT) || 9000;
const ISOLATE_PEER = PEER_PORT !== PORT; // true in dev, false in prod

let peerHandler;

if (ISOLATE_PEER) {
  // ── Dev: Separate dedicated PeerJS server on port 9000 ──────
  const peerApp = express();
  const peerServer = http.createServer(peerApp);

  peerApp.use(cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) return callback(null, true);
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }));

  peerHandler = ExpressPeerServer(peerServer, {
    debug: false,
    path: '/peerjs',
    allow_discovery: false,
    proxied: true,
  });

  peerApp.use(peerHandler);
  peerApp.get('/health', (_req, res) => res.json({ status: 'ok', service: 'peerjs' }));

  peerServer.listen(PEER_PORT, '0.0.0.0', () => {
    console.log(`[PeerJS]  ✓ PeerJS active (isolated) on port ${PEER_PORT}`);
  });

} else {
  // ── Prod: Co-exist on the same port by decoupling upgrade listeners ──────
  // PeerJS uses 'ws', which aggressively destroys incoming upgrade sockets if 
  // they do not match its path. This crashes Socket.io's engine!
  // Fix: pass a dummy server so PeerJS doesn't attach to the main httpServer.
  const peerDummyServer = http.createServer();
  peerHandler = ExpressPeerServer(peerDummyServer, {
    debug: false,
    path: '/peerjs',
    allow_discovery: false,
    proxied: true,
  });

  // Mount globally. The inner PeerJS router strictly expects exactly /peerjs
  app.use(peerHandler);
  
  // Conditionally route WebSocket upgrades to the Dummy Peer Server verbatim
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/peerjs')) {
      peerDummyServer.emit('upgrade', req, socket, head);
    }
  });

  console.log('[PeerJS]  ✓ PeerJS mounted safely on main server at /peerjs');
}

peerHandler.on('connection', (client) => {
  console.log(`[PeerJS] ✓ Peer connected: ${client.getId()}`);
});

peerHandler.on('disconnect', (client) => {
  console.log(`[PeerJS] ✗ Peer disconnected: ${client.getId()}`);
});

// ── Start Socket.IO Gateway ─────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Gateway] ✓ Socket.IO active on port ${PORT}`);
  if (!ISOLATE_PEER) {
    console.log(`[PeerJS]  ✓ PeerJS accessible at http://0.0.0.0:${PORT}/peerjs`);
  }
});

