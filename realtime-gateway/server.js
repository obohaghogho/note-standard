const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { authMiddleware } = require('./auth');
const redis = require('redis');
const redisAdapter = require('socket.io-redis');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);

// PeerJS Server setup
const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(httpServer, {
  debug: true,
  path: '/'
});

app.use('/peerjs', peerServer);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://notestandard.com",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  perMessageDeflate: false,
});

// Redis Adapter for scaling
if (process.env.REDIS_URL) {
  const pubClient = redis.createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  
  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(redisAdapter({ pubClient, subClient }));
    console.log('[Gateway] Redis adapter enabled');

    // Also listen for direct events from the main server
    const eventSubscriber = pubClient.duplicate();
    eventSubscriber.connect().then(() => {
      eventSubscriber.subscribe('realtime:events', (message) => {
        try {
          const { event, data } = JSON.parse(message);
          console.log(`[Gateway] Bridge event: ${event}`);

          if (event === 'to_user') {
            io.to(`user:${data.userId}`).emit(data.event, data.data);
          } else if (event === 'to_conversation') {
            io.to(data.conversationId).emit(data.event, data.data);
          } else if (event === 'to_admin') {
            io.to('admin_room').emit(data.event, data.data);
          } else if (event === 'broadcast') {
            io.emit(data.event, data.data);
          }
        } catch (err) {
          console.error('[Gateway] Bridge error:', err.message);
        }
      });
    });
  });
}

// Authentication Middleware
io.use(authMiddleware);

// Event Handlers
const walletHandlers = require('./events/wallet');
const chatHandlers = require('./events/chat');
const callHandlers = require('./events/call');
const notificationHandlers = require('./events/notifications');

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`[Gateway] New connection: ${socket.id} (User: ${userId})`);

  // Join personal room
  socket.join(`user:${userId}`);

  // Initialize modules
  const wallet = walletHandlers(io, socket);
  chatHandlers(io, socket);
  callHandlers(io, socket);
  const notifications = notificationHandlers(io, socket);

  // Handle cross-service events via Redis Pub/Sub (if needed) or simple io.to(...)
  // Note: If the main server publishes to Redis, io.adapter handles broadcasting.

  socket.on('disconnect', (reason) => {
    console.log(`[Gateway] Disconnected: ${socket.id} (${reason})`);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'realtime-gateway' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`[Gateway] Realtime server running on port ${PORT}`);
});
