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
 * GET /webrtc/ice-servers
 * Returns the full ICE server configuration for this session.
 */
router.get('/ice-servers', async (req, res) => {
  const turnHost = process.env.TURN_HOST;
  const turnSecret = process.env.TURN_SECRET;           // Metered REST API key
  const turnStaticUsername = process.env.TURN_STATIC_USERNAME;  // Static username
  const turnStaticCredential = process.env.TURN_STATIC_CREDENTIAL || turnSecret; // Static password

  const stunUrl  = process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302';
  const iceServers = [];

  // ── STUN servers (always included) ──────────────────────────
  iceServers.push({ urls: stunUrl });
  iceServers.push({ urls: 'stun:stun1.l.google.com:19302' });

  if (turnHost && turnSecret) {
    const isMetered = turnHost.includes('metered.live') || turnHost.includes('metered.ca');

    // ── 1. Metered.live REST API Credentials ──────────────────
    if (isMetered && !turnStaticUsername) {
      try {
        console.log(`[WebRTC] Fetching REST credentials from Metered.live (${turnHost})`);
        const response = await fetch(`https://${turnHost}/api/v1/turn/credentials?apiKey=${turnSecret}`);
        
        if (response.ok) {
          const meteredServers = await response.json();
          return res.json({
            iceServers: [...iceServers, ...meteredServers],
            ttl: 86400,
            message: 'Metered.live REST credentials issued',
          });
        } else {
          console.error('[WebRTC] Metered API Error:', response.status, response.statusText);
        }
      } catch (err) {
        console.error('[WebRTC] Failed to fetch Metered REST credentials:', err.message);
      }
    }

    // ── 2. Dashboard-Provided Static Credentials ──────────────
    // Triggered when TURN_STATIC_USERNAME is set in env
    if (turnStaticUsername) {
      // Metered.ca global relay — all ports for maximum firewall penetration
      iceServers.push({ urls: 'stun:stun.relay.metered.ca:80' });
      iceServers.push({
        urls: 'turn:global.relay.metered.ca:80',
        username: turnStaticUsername,
        credential: turnStaticCredential,
      });
      iceServers.push({
        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
        username: turnStaticUsername,
        credential: turnStaticCredential,
      });
      iceServers.push({
        urls: 'turn:global.relay.metered.ca:443',
        username: turnStaticUsername,
        credential: turnStaticCredential,
      });
      iceServers.push({
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: turnStaticUsername,
        credential: turnStaticCredential,
      });

      console.log('[WebRTC] Serving static Metered TURN credentials to client');
      return res.json({
        iceServers,
        ttl: 86400,
        message: 'Static TURN credentials issued',
      });
    }
  }

  // ── 3. STUN-only Fallback ─────────────────────────────────
  res.json({
    iceServers,
    ttl: 3600,
    warning: 'TURN not configured or API request failed — calls may fail on restrictive networks or LTE',
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
