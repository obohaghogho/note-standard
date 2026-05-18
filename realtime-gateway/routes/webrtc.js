/**
 * WebRTC ICE Server Configuration Route — Gateway
 *
 * Returns STUN + TURN server config for clients.
 * TURN credentials are issued dynamically from env vars.
 * All clients MUST fetch this before initiating any call.
 *
 * Clients should:
 *  1. GET /webrtc/ice-servers (with auth token)
 *  2. Use the returned iceServers array in RTCPeerConnection config
 *  3. Re-fetch if credentials expire (ttl field indicates seconds)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * Generate time-limited TURN credentials using the standard HMAC method.
 * Compatible with Coturn's --use-auth-secret mechanism.
 *
 * username = "<unix_timestamp_expiry>:<userId>"
 * password = HMAC-SHA1(secret, username)
 */
function generateTurnCredentials(userId) {
  const secret = process.env.TURN_SECRET;
  const ttlSeconds = parseInt(process.env.TURN_CREDENTIAL_TTL || '86400', 10); // 24h default
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${userId || 'anonymous'}`;

  let credential = 'temporary';
  if (secret) {
    credential = crypto
      .createHmac('sha1', secret)
      .update(username)
      .digest('base64');
  }

  return { username, credential, ttl: ttlSeconds };
}

/**
 * GET /webrtc/ice-servers
 * Returns the full ICE server configuration for this session.
 */
router.get('/ice-servers', (req, res) => {
  // Extract userId from socket auth or query param (gateway-specific auth)
  const userId = req.query.userId || 'anonymous';

  const turnUrl  = process.env.TURN_SERVER_URL;   // e.g. turn:your-server.com
  const turnHost = process.env.TURN_HOST;          // e.g. your-server.com or IP
  const stunUrl  = process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302';

  const iceServers = [];

  // ── STUN servers (always included) ──────────────────────────
  iceServers.push({ urls: stunUrl });
  iceServers.push({ urls: 'stun:stun1.l.google.com:19302' });

  // ── TURN servers (when configured) ──────────────────────────
  if (turnUrl || turnHost) {
    const { username, credential, ttl } = generateTurnCredentials(userId);
    const host = turnHost || (turnUrl ? turnUrl.replace(/^turn:/, '') : null);

    if (host) {
      // UDP TURN (primary — lowest latency)
      iceServers.push({
        urls:       `turn:${host}:3478?transport=udp`,
        username,
        credential,
      });

      // TCP TURN (fallback — works through most firewalls)
      iceServers.push({
        urls:       `turn:${host}:3478?transport=tcp`,
        username,
        credential,
      });

      // TLS TURN on port 443 (for restrictive networks / corporate firewalls)
      if (process.env.TURN_TLS_ENABLED === 'true') {
        iceServers.push({
          urls:       `turns:${host}:443?transport=tcp`,
          username,
          credential,
        });
      }

      return res.json({
        iceServers,
        ttl,
        username,
        // Never expose credential in logs — only send to authenticated client
        message: 'TURN credentials issued',
      });
    }
  }

  // STUN-only fallback (WiFi only — warn in response)
  res.json({
    iceServers,
    ttl: 3600,
    warning: 'TURN not configured — calls may fail on restrictive networks or LTE',
  });
});

/**
 * GET /webrtc/health
 * Quick health check for the WebRTC signaling system.
 */
router.get('/health', (req, res) => {
  const hasTurn = !!(process.env.TURN_SERVER_URL || process.env.TURN_HOST);
  const hasSecret = !!process.env.TURN_SECRET;
  const hasTls = process.env.TURN_TLS_ENABLED === 'true';

  res.json({
    status:    'ok',
    stun:      true,
    turn:      hasTurn,
    turnSecret: hasSecret,
    turnTls:   hasTls,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
