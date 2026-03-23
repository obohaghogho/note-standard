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

const fetch = require('node-fetch');

/**
 * Emit an event to the realtime gateway via Redis Pub/Sub
 */
const emit = async (event, data) => {
  try {
    if (publisher && publisher.isOpen) {
      await publisher.publish('realtime:events', JSON.stringify({ event, data }));
    } else {
      // Dev Fallback: Direct HTTP call to gateway
      await fetch('http://localhost:5000/internal/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data })
      });
    }
  } catch (err) {
    console.error('[RealtimeService] Emit failed:', err.message);
  }
};

const emitToUser = async (userId, event, data) => {
  await emit('to_user', { userId, event, data });
};

const emitToConversation = async (conversationId, event, data) => {
  await emit('to_conversation', { conversationId, event, data });
};

const emitToAdmin = async (event, data) => {
  await emit('to_admin', { event, data });
};

const broadcast = async (event, data) => {
  await emit('broadcast', { event, data });
};

module.exports = {
  emit,
  emitToUser,
  emitToConversation,
  emitToAdmin,
  broadcast
};
