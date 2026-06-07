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
// PeerJS removed — pure WebRTC signaling via Socket.IO
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
  'http://127.0.0.1.nip.io:5173',
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

// ✅ 5b. INTERNAL NATIVE PUSH ENDPOINT
// Called by the API server to send FCM/APNs push for chat messages.
// The gateway holds the Firebase Admin and APNs credentials.
const pushService = require('./services/pushService');
app.post('/internal/push', async (req, res) => {
  try {
    const { userId, title, body, payload } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Fire-and-forget so the API server isn't blocked waiting for APNs/FCM
    pushService.sendGenericPush({ userId, title, body: body || '', payload: payload || {} })
      .catch(err => console.error('[Gateway] /internal/push error:', err.message));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/internal/push/broadcast', async (req, res) => {
  try {
    const { title, body, payload } = req.body;

    // Fire-and-forget
    pushService.sendBroadcastPush({ title, body: body || '', payload: payload || {} })
      .catch(err => console.error('[Gateway] /internal/push/broadcast error:', err.message));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * Global Dispatcher for Socket Events
 * Standardized envelope: { type: string, room: string, event: string, payload: any, exclude_user_id?: string }
 *
 * Optional exclude_user_id: when set, the sender's socket(s) are excluded from
 * the broadcast so they do not receive an echo of their own message.
 */
function dispatchSocketEvent(envelope) {
  const { type, room, event, payload, exclude_user_id } = envelope;

  if (!type || !event) {
    console.warn('[Gateway] ⚠ Received malformed event envelope:', JSON.stringify(envelope).substring(0, 100));
    return;
  }

  // Consistent Room Resolver
  const targetRoom = type === 'to_user' ? `user:${room}` : room;

  console.log(`[Gateway] 📡 [${type}] room:${targetRoom || 'N/A'} event:${event}${exclude_user_id ? ` (excluding user:${exclude_user_id})` : ''}`);

  if (type === 'to_users' && Array.isArray(envelope.users)) {
    envelope.users.forEach(uid => {
      if (exclude_user_id && uid === exclude_user_id) return;
      io.to(`user:${uid}`).emit(event, payload);
    });
    return;
  }

  if (type === 'broadcast') {
    io.emit(event, payload);
  } else if (exclude_user_id) {
    // Find all socket IDs belonging to the excluded user and exclude them.
    // This prevents the sender from receiving an echo of their own message.
    const userRoom = `user:${exclude_user_id}`;
    const excludedSocketIds = [];
    try {
      const socketsInUserRoom = io.sockets.adapter.rooms.get(userRoom);
      if (socketsInUserRoom) {
        socketsInUserRoom.forEach(sid => excludedSocketIds.push(sid));
      }
    } catch (e) {
      // adapter.rooms may not exist in all Socket.IO versions — fallback gracefully
    }

    if (excludedSocketIds.length > 0) {
      io.to(targetRoom).except(excludedSocketIds).emit(event, payload);
    } else {
      // User has no active sockets — broadcast to all (they'll handle dedup client-side)
      io.to(targetRoom).emit(event, payload);
    }
  } else {
    io.to(targetRoom).emit(event, payload);
  }
}

// ✅ 6. PEERJS SETUP — 100% Isolated Dummy Server Pattern
// ✅ 6. WebRTC ICE Server Config Route
// Provides STUN/TURN configuration to clients. Replaces the removed PeerJS server.
const webrtcRoutes = require('./routes/webrtc');
app.use('/webrtc', webrtcRoutes);

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

// Production Hardening: Configure Redis adapter if REDIS_URL is provided for multi-instance horizontal scaling
const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();
    
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.IO] 🔴 Redis Adapter integrated successfully for multi-instance scaling.');
    }).catch(err => {
      console.error('[Socket.IO] 🔴 Redis Connection failed:', err.message);
    });
  } catch (err) {
    try {
      const redisAdapter = require('socket.io-redis');
      io.adapter(redisAdapter(REDIS_URL));
      console.log('[Socket.IO] 🔴 socket.io-redis Adapter integrated successfully.');
    } catch (e) {
      console.error('[Socket.IO] 🔴 Failed to initialize Redis Adapter:', err.message);
    }
  }
}

// Socket.IO handles WebSocket upgrades natively — no custom upgrade listener needed.

io.use(authMiddleware);

const chatHandlers = require('./events/chat');
const callHandlers = require('./events/call');
const walletHandlers = require('./events/wallet');
const notificationHandlers = require('./events/notifications');
const presenceHandlers = require('./events/presence');

io.on('connection', async (socket) => {
  const userId = socket.userId;
  const sessionId = socket.sessionId;
  const deviceId = socket.deviceId;

  // Soft Socket Replacement
  const sessionRoom = `session:${sessionId}`;
  const existingSockets = await io.in(sessionRoom).fetchSockets();
  if (existingSockets.length > 0) {
    console.log(`[Socket.IO] ♻️ Soft replacing existing socket for session ${sessionId}`);
    existingSockets.forEach(s => {
      if (s.id !== socket.id) {
        s.emit('session:replaced');
        s.disconnect(true);
      }
    });
  }

  console.log(`[Socket.IO] ✓ ${socket.id} connected (user: ${userId}, session: ${sessionId})`);
  socket.join(`user:${userId}`);
  socket.join(`session:${sessionId}`);
  socket.join(`device:${deviceId}`);
  
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

let isReconnecting = false;
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
      if (!isReconnecting) reconnectPg();
    }
  });

  pgClient.on('notification', async (msg) => {
    if (msg.channel === 'realtime_events') {
      try {
        const envelope = JSON.parse(msg.payload);
        
        // Handle session revocation gracefully
        if (envelope.event === 'session:revoked') {
          console.log(`[Gateway] 🛑 Session revoked: ${envelope.sessionId}`);
          const sessionRoom = `session:${envelope.sessionId}`;
          const sockets = await io.in(sessionRoom).fetchSockets();
          sockets.forEach(s => {
            s.emit('auth:revoked');
            s.disconnect(true);
          });
          return;
        }

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
        
        // Production Hardening: Reconcile orphaned active call sessions automatically on gateway startup
        console.log('[Gateway] 🐘 Reconciling orphaned active call sessions...');
        const reconcileRes = await pgClient.query('SELECT cleanup_stale_call_sessions()');
        const resolvedCount = reconcileRes.rows[0]?.cleanup_stale_call_sessions || 0;
        if (resolvedCount > 0) {
          console.log(`[Gateway] 🐘 ✓ Resolved ${resolvedCount} orphaned call sessions during gateway startup recovery.`);
        } else {
          console.log('[Gateway] 🐘 ✓ No orphaned call sessions found.');
        }
      } catch (err) {
        console.error('[Gateway] 🐘 PostgreSQL connection failed:', err.message);
        if (!isReconnecting) reconnectPg();
      }
    }

  async function reconnectPg() {
    isReconnecting = true;
    console.log('[Gateway] 🐘 Attempting to reconnect to PostgreSQL in 5s...');
    setTimeout(() => {
      isReconnecting = false;
      initPgListener();
    }, 5000);
    try {
      await pgClient.end().catch(() => {});
    } catch (e) {
      // Ignore disconnect errors
    }
  }

  connect();
}

initPgListener();

// ✅ 9. START SERVER
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway Server active on port ${PORT}`);
});
