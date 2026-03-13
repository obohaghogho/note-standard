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
//  1. SOCKET.IO SERVER (port 5000)
// ═══════════════════════════════════════════════════════════════
const app = express();
const httpServer = http.createServer(app);

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
  // Start with polling (always works), then upgrade to websocket
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  // Do NOT compress — avoids "Invalid frame header" on some proxies
  perMessageDeflate: false,
  httpCompression: false,
});

// Auth — verify Supabase JWT before connection
io.use(authMiddleware);

// Load event handlers
const chatHandlers = require('./events/chat');
const callHandlers = require('./events/call');
const walletHandlers = require('./events/wallet');
const notificationHandlers = require('./events/notifications');

io.on('connection', (socket) => {
  const userId = socket.userId;
  const transport = socket.conn.transport.name;
  console.log(`[Socket.IO] ✓ ${socket.id} connected (user: ${userId}, via: ${transport})`);

  // Auto-join personal room for targeted events
  socket.join(`user:${userId}`);

  // Register event handlers
  chatHandlers(io, socket);
  callHandlers(io, socket);
  walletHandlers(io, socket);
  notificationHandlers(io, socket);

  // Log transport upgrade
  socket.conn.on('upgrade', (t) => {
    console.log(`[Socket.IO] ↑ ${socket.id} upgraded to ${t.name}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] ✗ ${socket.id} disconnected (${reason})`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  2. PEERJS SIGNALING SERVER (port 9000)
// ═══════════════════════════════════════════════════════════════
const peerApp = express();
const peerHttp = http.createServer(peerApp);

// CORS for PeerJS XHR heartbeats
peerApp.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const peerServer = ExpressPeerServer(peerHttp, {
  debug: true,
  path: '/',
  allow_discovery: false,
});

peerApp.use('/peerjs', peerServer);

// Log PeerJS events
peerServer.on('connection', (client) => {
  console.log(`[PeerJS] ✓ Peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
  console.log(`[PeerJS] ✗ Peer disconnected: ${client.getId()}`);
});

// ═══════════════════════════════════════════════════════════════
//  3. HTTP BRIDGE (dev fallback — when Redis is unavailable)
// ═══════════════════════════════════════════════════════════════
app.use(express.json());

app.post('/internal/emit', (req, res) => {
  const { event, data } = req.body;
  if (!event || !data) return res.status(400).json({ error: 'Missing event or data' });

  console.log(`[Bridge] ${event}`);

  switch (event) {
    case 'to_user':
      io.to(`user:${data.userId}`).emit(data.event, data.data);
      break;
    case 'to_conversation':
      io.to(data.conversationId).emit(data.event, data.data);
      break;
    case 'to_admin':
      io.to('admin_room').emit(data.event, data.data);
      break;
    case 'broadcast':
      io.emit(data.event, data.data);
      break;
  }

  res.json({ ok: true });
});

// Health
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'realtime-gateway',
    socketClients: io.engine.clientsCount,
  });
});

// ═══════════════════════════════════════════════════════════════
//  4. START BOTH SERVERS
// ═══════════════════════════════════════════════════════════════
const SOCKET_PORT = process.env.PORT || 5000;
const PEER_PORT = process.env.PEER_PORT || 9000;

httpServer.listen(SOCKET_PORT, () => {
  console.log(`[Gateway] Socket.IO  → http://localhost:${SOCKET_PORT}`);
});

peerHttp.listen(PEER_PORT, () => {
  console.log(`[Gateway] PeerJS    → http://localhost:${PEER_PORT}/peerjs`);
});
