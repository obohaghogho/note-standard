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
const emit = async (event, data) => {
  if (publisher && publisher.isOpen) {
    try {
      await publisher.publish('realtime:events', JSON.stringify({ event, data }));
    } catch (err) {
      console.error('[RealtimeService] Redis publish failed:', err.message);
    }
  } else {
    // Dev Fallback: Direct HTTP call to gateway
    try {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      await fetch('http://localhost:5000/internal/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data })
      });
    } catch (err) {
      // Silently fail or log if gateway is also down
    }
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
  emitToConversation,
  emitToAdmin,
  broadcast
};
