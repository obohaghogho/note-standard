const redis = require('redis');
require('dotenv').config();

let publisher;

if (process.env.REDIS_URL) {
  publisher = redis.createClient({ url: process.env.REDIS_URL });
  publisher.connect().catch(err => {
    console.error('[RealtimeService] Redis connection failed:', err.message);
  });
  console.log('[RealtimeService] Redis publisher initialized');
}

/**
 * Emit an event to the realtime gateway via Redis Pub/Sub
 */
const emit = (event, data) => {
  if (publisher) {
    // Socket.IO Redis adapter specifically listens for certain patterns
    // but we can also use a custom channel. 
    // For simplicity, we'll use a standard broadcast pattern that the gateway listens for.
    publisher.publish('realtime:events', JSON.stringify({ event, data }));
  } else {
    console.warn('[RealtimeService] Redis not available, event dropped:', event);
  }
};

const emitToUser = (userId, event, data) => {
  emit('to_user', { userId, event, data });
};

const emitToConversation = (conversationId, event, data) => {
  emit('to_conversation', { conversationId, event, data });
};

const emitToAdmin = (event, data) => {
  emit('to_admin', { event, data });
};

const broadcast = (event, data) => {
  emit('broadcast', { event, data });
};

module.exports = {
  emit,
  emitToUser,
  emitToAdmin,
  broadcast
};
