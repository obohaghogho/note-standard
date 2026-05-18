/**
 * WebRTC Route — NoteStandard API Server
 *
 * Proxies ICE server config requests from clients to the gateway.
 * The gateway holds TURN credentials; this route authenticates the
 * client and forwards the request securely.
 *
 * Also provides a call session history endpoint.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const supabase = require('../config/database');
const logger = require('../utils/logger');
const fetch = require('node-fetch');

const GATEWAY_INTERNAL_URL = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';

/**
 * GET /api/webrtc/ice-servers
 * Authenticated proxy to gateway ICE server config.
 * Client must include Authorization header.
 */
router.get('/ice-servers', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    const gatewayUrl = `${GATEWAY_INTERNAL_URL}/webrtc/ice-servers?userId=${userId}`;

    const response = await fetch(gatewayUrl, { timeout: 5000 });
    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    logger.error('[WebRTC] ICE server fetch failed — returning STUN fallback', { error: err.message });
    // Always return at least STUN so calls degrade gracefully
    return res.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      ttl: 3600,
      warning: 'TURN unavailable — using STUN only (calls may fail on restricted networks)',
    });
  }
});

/**
 * GET /api/webrtc/call-history
 * Returns the authenticated user's call session history.
 */
router.get('/call-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data: sessions, error } = await supabase
      .from('call_sessions')
      .select(`
        id,
        caller_id,
        callee_id,
        conversation_id,
        call_type,
        status,
        started_at,
        answered_at,
        ended_at,
        duration_seconds,
        end_reason
      `)
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .order('started_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    return res.json({ success: true, sessions: sessions || [], page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    logger.error('[WebRTC] Call history fetch failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch call history' });
  }
});

/**
 * GET /api/webrtc/active-call
 * Check if the user has an active call session (for reconnect recovery).
 */
router.get('/active-call', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.sub;

    const { data: session } = await supabase
      .from('call_sessions')
      .select('*')
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .in('status', ['ringing', 'connecting', 'active'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json({ success: true, session: session || null });
  } catch (err) {
    logger.error('[WebRTC] Active call check failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to check active call' });
  }
});

module.exports = router;
