const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { registerDeviceSession, heartbeatSession, forceTakeoverLease } = require('../rpc/sessionArbitration');

router.use(requireAuth);

/**
 * POST /api/session/register
 * Register or refresh a device session. Returns a session_id.
 */
router.post('/register', async (req, res) => {
    try {
        const { deviceId, userId, userAgent, ipAddress } = req.body;

        if (!deviceId || !userId) {
            return res.status(400).json({ error: 'deviceId and userId are required' });
        }

        const result = await registerDeviceSession({
            userId,
            deviceId,
            ipAddress: ipAddress || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: userAgent || req.headers['user-agent']
        });

        return res.json({ session_id: result.session_id, expires_in: 300 });
    } catch (err) {
        console.error('[Session] Registration failed:', err.message);
        return res.status(500).json({ error: 'Session registration failed' });
    }
});

/**
 * POST /api/session/heartbeat
 * Renew an existing device session and conversation leases.
 */
router.post('/heartbeat', async (req, res) => {
    try {
        const { sessionId, conversationIds } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        await heartbeatSession({ sessionId });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[Session] Heartbeat failed:', err.message);
        return res.status(500).json({ error: 'Heartbeat failed' });
    }
});

/**
 * POST /api/session/takeover
 * Atomically transfer a conversation lease to this device.
 * Called by the Lease Barrier before transmitting queued offline messages.
 */
router.post('/takeover', async (req, res) => {
    try {
        const { conversationId, sessionId, deviceId } = req.body;

        if (!conversationId || !sessionId || !deviceId) {
            return res.status(400).json({ error: 'conversationId, sessionId, and deviceId are required' });
        }

        const result = await forceTakeoverLease({ conversationId, sessionId, deviceId });

        if (!result?.success) {
            return res.status(409).json({ error: 'Lease takeover failed', details: result });
        }

        return res.json({ success: true, lease: result });
    } catch (err) {
        console.error('[Session] Takeover failed:', err.message);
        return res.status(500).json({ error: 'Lease takeover failed' });
    }
});

module.exports = router;
