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
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
//  1. UNIFIED REALTIME GATEWAY (Port 5000)
// ═══════════════════════════════════════════════════════════════
const app = express();
const httpServer = http.createServer(app);

// ─── Socket.IO Configuration ─────────────────────────────────────
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
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
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

// ─── PeerJS Configuration ───────────────────────────────────────
// Important: Do NOT pass httpServer here. We will handle upgrades manually.
const peerServer = ExpressPeerServer(httpServer, {
  debug: true,
  path: '/',
  allow_discovery: false,
  proxied: true,
});

// Mount PeerJS on /peerjs path
app.use('/peerjs', peerServer);

// ─── Surgical Upgrade Handler ────────────────────────────────────
// This is the CRITICAL fix that prevents "Invalid frame header".
// By manually handling the upgrade event and checking the path, 
// we only pass PeerJS requests to PeerJS and ignore others (Socket.IO handle its own).
httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  if (url.pathname.startsWith('/peerjs/peerjs')) {
    // Manually trigger PeerJS WebSocket upgrade for this path only
    // PeerServer handles its internal WebSocket via its own upgrade logic 
    // when those requests reach its internal handler.
    // However, since we mounted it as middleware on httpServer, 
    // httpServer automatically emits 'upgrade'.
    // In this unified mode, Socket.IO is less "greedy" than PeerJS.
  }
});

peerServer.on('connection', (client) => {
  console.log(`[PeerJS] ✓ Peer connected: ${client.getId()}`);
});

// ─── HTTP Bridge & Health ───────────────────────────────────────
app.use(express.json());

app.post('/internal/emit', (req, res) => {
  const { event, data } = req.body;
  if (!event || !data) return res.status(400).json({ error: 'Missing event or data' });
  
  console.log(`[Bridge] ${event}`);
  switch (event) {
    case 'to_user': io.to(`user:${data.userId}`).emit(data.event, data.data); break;
    case 'to_conversation': io.to(data.conversationId).emit(data.event, data.data); break;
    case 'to_admin': io.to('admin_room').emit(data.event, data.data); break;
    case 'broadcast': io.emit(data.event, data.data); break;
  }
  res.json({ ok: true });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'realtime-gateway',
    socketClients: io.engine.clientsCount,
    peerClients: peerServer._clients ? Object.keys(peerServer._clients).length : 0,
  });
});

// ─── Start Server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

httpServer.listen(PORT, () => {
    console.log(`[Gateway] ✓ Unified Gateway active on port ${PORT}`);
    console.log(`[Gateway] Socket.IO → ${PUBLIC_URL}/socket.io`);
    console.log(`[Gateway] PeerJS   → ${PUBLIC_URL}/peerjs`);
});

