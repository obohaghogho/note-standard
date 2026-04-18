const { Pool } = require('pg');
require('dotenv').config();

let pgPool;

if (process.env.DATABASE_URL) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pgPool.on('error', (err) => {
    console.error('[RealtimeService] PostgreSQL Pool Error:', err.message);
  });

  console.log('[RealtimeService] PostgreSQL pool initialized for NOTIFY');
}

const fetch = require('node-fetch');

/**
 * Standardized Realtime Emit via PostgreSQL LISTEN/NOTIFY
 */
const emit = async (type, room, event, payload) => {
  try {
    const envelope = { type, room, event, payload };
    const payloadString = JSON.stringify(envelope);

    if (payloadString.length > 7900) {
      console.warn('[RealtimeService] Payload exceeds PostgreSQL NOTIFY limit (8000 bytes). Truncating or failing.');
      // In a real app, you'd save to DB and only notify the ID. 
      // For chat, this is rare unless sending large base64 (which we don't).
    }
    
    if (pgPool) {
      // Use NOTIFY channel 'realtime_events'
      await pgPool.query('SELECT pg_notify($1, $2)', ['realtime_events', payloadString]);
    } else {
      // Fallback: Direct HTTP call to gateway
      const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
      await fetch(`${gatewayUrl}/internal/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadString
      });
    }
  } catch (err) {
    console.error('[RealtimeService] Emit failed:', err.message);
  }
};

const emitToUser = async (userId, event, payload) => {
  await emit('to_user', userId, event, payload);
};

const emitToConversation = async (conversationId, event, payload) => {
  await emit('to_conversation', conversationId, event, payload);
};

const emitToAdmin = async (event, payload) => {
  await emit('to_admin', 'admin_room', event, payload);
};

const broadcast = async (event, payload) => {
  await emit('broadcast', '*', event, payload);
};

module.exports = {
  emit,
  emitToUser,
  emitToConversation,
  emitToAdmin,
  broadcast
};
