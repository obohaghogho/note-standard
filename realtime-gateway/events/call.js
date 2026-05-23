/**
 * Call Event Handler — NoteStandard Realtime Gateway
 *
 * Pure WebRTC signaling over Socket.IO.
 * - NO Agora, NO PeerJS, NO carrier/telecom
 * - DB-persisted call sessions (survives gateway restarts)
 * - ICE trickle candidate buffering
 * - Full state machine: ringing → connecting → active → ended
 * - Stale call cleanup on disconnect
 */
const { createClient } = require('@supabase/supabase-js');
const pushService = require('../services/pushService');

// ── Production Hardening: Sliding-Window Rate Limiter Shield ─────────────────
const rateLimits = new Map();

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  if (!rateLimits.has(key)) {
    rateLimits.set(key, [now]);
    return true;
  }
  const timestamps = rateLimits.get(key).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  rateLimits.set(key, timestamps);
  return true;
}

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── DB Helpers ──────────────────────────────────────────────────────────────

async function createCallSession({ callerId, calleeId, conversationId, callType }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('call_sessions')
    .insert({
      caller_id: callerId,
      callee_id: calleeId,
      conversation_id: conversationId,
      call_type: callType,
      status: 'ringing',
    })
    .select('id')
    .single();
  if (error) {
    console.error('[Call] Failed to create session:', error.message);
    return null;
  }
  return data.id;
}

async function updateCallSession(sessionId, fields) {
  if (!supabase || !sessionId) return;
  const { error } = await supabase
    .from('call_sessions')
    .update(fields)
    .eq('id', sessionId);
  if (error) {
    console.error('[Call] Failed to update session:', error.message);
  }
}

async function getActiveSessions(userId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('call_sessions')
    .select('*')
    .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
    .in('status', ['ringing', 'connecting', 'active'])
    .order('started_at', { ascending: false })
    .limit(5);
  return data || [];
}

async function storeIceCandidate(sessionId, fromUserId, candidate) {
  if (!supabase || !sessionId) return;
  await supabase.from('webrtc_ice_candidates').insert({
    session_id: sessionId,
    from_user_id: fromUserId,
    candidate,
  });
}

async function getBufferedIceCandidates(sessionId, fromUserId) {
  if (!supabase || !sessionId) return [];
  const { data } = await supabase
    .from('webrtc_ice_candidates')
    .select('candidate')
    .eq('session_id', sessionId)
    .eq('from_user_id', fromUserId)
    .order('created_at', { ascending: true });
  return (data || []).map(r => r.candidate);
}

async function cleanupIceCandidates(sessionId) {
  if (!supabase || !sessionId) return;
  await supabase.from('webrtc_ice_candidates').delete().eq('session_id', sessionId);
}

// ── Active call state (in-flight fast lookup, DB is the source of truth) ────
// Maps targetUserId → { sessionId, callerId, callerName, callerAvatar, callType, conversationId }
const activeCalls = new Map();
// Maps sessionId → { callerId, calleeId } for disconnect cleanup
const sessionMap = new Map();

// ── Utilities ───────────────────────────────────────────────────────────────

async function sendCallPush(io, targetUserId, type, data) {
  try {
    // Only push if user has no live socket (offline wake-up)
    const sockets = await io.in(`user:${targetUserId}`).fetchSockets();
    if (sockets.length === 0) {
      await pushService.sendCallPush({
        userId: targetUserId,
        title: data.title,
        body: data.body,
        payload: data.payload,
      });
    }
  } catch (err) {
    console.error('[Call] Push dispatch error:', err.message);
  }
}

// ── Main handler export ──────────────────────────────────────────────────────

module.exports = (io, socket) => {
  const userId = socket.userId;
  const userName = socket.userName || 'Someone';
  const userAvatar = socket.userAvatar || null;

  // ── 0. Late-joiner Sync ────────────────────────────────────────────────────
  // On reconnect: replay any pending incoming calls from DB
  (async () => {
    try {
      const sessions = await getActiveSessions(userId);
      for (const session of sessions) {
        // Only notify if WE are the callee (someone is calling us)
        if (String(session.callee_id) === String(userId) && session.status === 'ringing') {
          console.log(`[Call] 🔄 Replaying pending call session ${session.id} to late-joiner ${userId}`);
          socket.emit('call:incoming', {
            sessionId:      session.id,
            from:           session.caller_id,
            fromName:       null, // caller name not stored here; callee should fetch from profile
            callType:       session.call_type,
            type:           session.call_type, // support both type and callType
            conversationId: session.conversation_id,
            isSync:         true,
          });
        }
        // If we are the caller and it's still ringing, let us know
        if (String(session.caller_id) === String(userId) && session.status === 'ringing') {
          socket.emit('call:outgoing_sync', {
            sessionId:      session.id,
            calleeId:       session.callee_id,
            callType:       session.call_type,
            type:           session.call_type, // support both type and callType
            conversationId: session.conversation_id,
          });
        }
      }
    } catch (err) {
      console.error('[Call] Late-joiner sync error:', err.message);
    }
  })();

  // ── 1. call:initiate ───────────────────────────────────────────────────────
  socket.on('call:initiate', async (data) => {
    const { to, conversationId } = data;
    const callType = data.callType || data.type; // support both type and callType
    if (!to || !callType || !conversationId) {
      socket.emit('call:error', { code: 'MISSING_FIELDS', message: 'to, callType/type, and conversationId are required' });
      return;
    }

    // Production Hardening: Sliding window rate limit: max 3 calls per 30 seconds per user
    if (!checkRateLimit(`call_initiate:${userId}`, 3, 30000)) {
      socket.emit('call:error', { code: 'RATE_LIMIT_EXCEEDED', message: 'You are initiating calls too frequently. Please wait.' });
      return;
    }

    console.log(`[Call] 📞 ${userId} → ${to} (${callType})`);

    // Persist to DB
    const sessionId = await createCallSession({
      callerId: userId,
      calleeId: to,
      conversationId,
      callType,
    });

    // Cache for fast lookup
    activeCalls.set(to, { sessionId, callerId: userId, callerName: userName, callerAvatar: userAvatar, callType, conversationId });
    if (sessionId) sessionMap.set(sessionId, { callerId: userId, calleeId: to });

    // Signal callee
    io.to(`user:${to}`).emit('call:incoming', {
      sessionId,
      from:           userId,
      fromName:       userName,
      fromAvatar:     userAvatar,
      callType,
      type:           callType, // support both type and callType
      conversationId,
    });

    // Native push for offline/background users
    await sendCallPush(io, to, 'call', {
      title: `Incoming ${callType} call`,
      body:  `${userName} is calling you`,
      payload: {
        type:           'incoming_call',
        callerId:       userId,
        callerName:     userName,
        callType,
        conversationId,
        sessionId,
      },
    });
  });

  // ── 1.5. call:ringing ──────────────────────────────────────────────────────
  socket.on('call:ringing', (data) => {
    const { to } = data;
    if (!to) return;
    io.to(`user:${to}`).emit('call:ringing', { from: userId });
  });

  // ── 2. call:answer / call:ready (aliases) ────────────────────────────────
  // BUG FIX: The client previously emitted `call:ready` which the server never
  // handled, causing the caller to never receive confirmation and permanently
  // hang at "Connecting...". Both event names are now accepted.
  async function handleCallAnswer(data) {
    const { to, sessionId } = data;
    if (!to) return;

    console.log(`[Call] ✅ ${userId} answered call from ${to} (session: ${sessionId})`);

    activeCalls.delete(userId);

    await updateCallSession(sessionId, {
      status:      'connecting',
      answered_at: new Date().toISOString(),
    });

    // Relay to caller — client listens for call:answered to create RTCPeerConnection
    io.to(`user:${to}`).emit('call:answered', {
      from:      userId,
      sessionId, // FIX: pass sessionId so caller can track it
    });
  }

  socket.on('call:answer', handleCallAnswer);
  // Alias: client may emit call:ready (kept for backward compatibility)
  socket.on('call:ready',  handleCallAnswer);

  // ── 3. call:signal (SDP Offer / Answer) ───────────────────────────────────
  socket.on('call:signal', async (data) => {
    const { to, signal, sessionId } = data;
    if (!to || !signal) return;

    // Production Hardening: Sliding window rate limit: max 60 signal messages per 10 seconds per user
    if (!checkRateLimit(`call_signal:${userId}`, 60, 10000)) {
      socket.emit('call:error', { code: 'RATE_LIMIT_EXCEEDED', message: 'SDP signaling rate limit exceeded. Please slow down.' });
      return;
    }

    // Production Hardening: Validate SDP payload size (limit: 256KB)
    const signalStr = JSON.stringify(signal);
    if (signalStr.length > 262144) {
      console.warn(`[Call] ⚠️ Rejected oversized SDP payload from ${userId} (${signalStr.length} bytes)`);
      socket.emit('call:error', { code: 'PAYLOAD_TOO_LARGE', message: 'SDP signal payload size exceeds allowed limits' });
      return;
    }

    // Persist SDP to DB for late-joiner recovery
    if (sessionId && signal.type === 'offer') {
      await updateCallSession(sessionId, { sdp_offer: signalStr });
    }
    if (sessionId && signal.type === 'answer') {
      await updateCallSession(sessionId, {
        sdp_answer: signalStr,
        status: 'active',
      });
    }

    io.to(`user:${to}`).emit('call:signal', {
      from:      userId,
      signal,
      sessionId,
    });
  });

  // ── 4. call:ice-candidate (trickle ICE) ────────────────────────────────────
  socket.on('call:ice-candidate', async (data) => {
    const { to, candidate, sessionId } = data;
    if (!to || !candidate) return;

    // Production Hardening: Sliding window rate limit: max 120 candidates per 10 seconds per user
    if (!checkRateLimit(`call_ice:${userId}`, 120, 10000)) {
      socket.emit('call:error', { code: 'RATE_LIMIT_EXCEEDED', message: 'ICE candidate rate limit exceeded. Please slow down.' });
      return;
    }

    const targetSockets = await io.in(`user:${to}`).fetchSockets();

    if (targetSockets.length > 0) {
      // Peer is online — relay directly
      io.to(`user:${to}`).emit('call:ice-candidate', {
        from:      userId,
        candidate,
        sessionId,
      });
    } else {
      // Peer is offline — buffer in DB for replay when they connect
      await storeIceCandidate(sessionId, userId, candidate);
    }
  });

  // ── 5. Replay buffered ICE candidates when peer comes online ───────────────
  socket.on('call:request-buffered-ice', async (data) => {
    const { sessionId, fromUserId } = data;
    if (!sessionId || !fromUserId) return;

    const candidates = await getBufferedIceCandidates(sessionId, fromUserId);
    for (const candidate of candidates) {
      socket.emit('call:ice-candidate', {
        from:      fromUserId,
        candidate,
        sessionId,
        buffered: true,
      });
    }
    // Clean up after replay
    await cleanupIceCandidates(sessionId);
  });

  // ── 6. call:reject ─────────────────────────────────────────────────────────
  socket.on('call:reject', async (data) => {
    const { to, sessionId } = data;
    if (!to) return;
    console.log(`[Call] ✗ ${userId} rejected call from ${to}`);

    activeCalls.delete(userId);

    await updateCallSession(sessionId, {
      status:     'rejected',
      end_reason: 'rejected',
      ended_at:   new Date().toISOString(),
    });

    io.to(`user:${to}`).emit('call:rejected', { from: userId, sessionId });

    await sendCallPush(io, to, 'call', {
      title:   'Call Rejected',
      body:    `${userName} declined your call`,
      payload: { type: 'call_cancelled', callerId: userId, sessionId },
    });
  });

  // ── 7. call:end ────────────────────────────────────────────────────────────
  socket.on('call:end', async (data) => {
    const { to, sessionId, conversationId } = data;
    if (!to) return;
    console.log(`[Call] 🏁 ${userId} ended call with ${to}`);

    // Clean both directions
    activeCalls.delete(to);
    activeCalls.delete(userId);
    if (sessionId) sessionMap.delete(sessionId);

    await updateCallSession(sessionId, {
      status:     'ended',
      end_reason: 'normal',
      ended_at:   new Date().toISOString(),
    });

    io.to(`user:${to}`).emit('call:ended', {
      from:           userId,
      sessionId,
      conversationId,
    });

    await sendCallPush(io, to, 'call', {
      title:   'Call Ended',
      body:    'The call has ended',
      payload: { type: 'call_cancelled', callerId: userId, sessionId },
    });
  });

  // ── 8. call:timeout ────────────────────────────────────────────────────────
  socket.on('call:timeout', async (data) => {
    const { to, sessionId } = data;
    if (!to) return;
    console.log(`[Call] ⏱️ Timeout for ${userId} → ${to}`);

    activeCalls.delete(to);
    activeCalls.delete(userId);

    await updateCallSession(sessionId, {
      status:     'missed',
      end_reason: 'timeout',
      ended_at:   new Date().toISOString(),
    });

    io.to(`user:${to}`).emit('call:timeout', { from: userId, sessionId });

    await sendCallPush(io, to, 'call', {
      title:   'Missed Call',
      body:    `You missed a ${data.callType || ''} call from ${userName}`,
      payload: { type: 'call_missed', callerId: userId, sessionId },
    });
  });

  // ── 9. call:reconnect ──────────────────────────────────────────────────────
  // Emitted when a peer temporarily drops and wants to resume
  socket.on('call:reconnect', async (data) => {
    const { to, sessionId } = data;
    if (!to || !sessionId) return;
    console.log(`[Call] 🔄 ${userId} requesting reconnect for session ${sessionId}`);

    await updateCallSession(sessionId, { status: 'connecting' });

    io.to(`user:${to}`).emit('call:reconnect_request', {
      from:      userId,
      sessionId,
    });
  });

  // ── 9b. call:telemetry (Hardened Network Analytics) ────────────────────────
  socket.on('call:telemetry', async (data) => {
    const { sessionId, networkQuality, deviceInfo, disconnectSide, reconnectCount } = data || {};
    if (!sessionId) return;

    console.log(`[Call Telemetry] Session: ${sessionId} reported by User: ${userId}`);

    const updateFields = {};
    if (networkQuality) updateFields.network_quality = networkQuality;
    if (deviceInfo) updateFields.device_info = deviceInfo;
    if (disconnectSide) updateFields.disconnect_side = disconnectSide;
    if (reconnectCount !== undefined) updateFields.reconnect_count = reconnectCount;

    await updateCallSession(sessionId, updateFields);
  });

  // ── 10. Disconnect cleanup ─────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    // Find any sessions this user was calling
    const callerSessions = [];
    activeCalls.forEach((call, targetId) => {
      if (String(call.callerId) === String(userId)) {
        callerSessions.push({ targetId, ...call });
      }
    });

    for (const session of callerSessions) {
      console.log(`[Call] 🧹 Disconnect cleanup: caller ${userId} → ${session.targetId}`);
      activeCalls.delete(session.targetId);

      // Give 15s grace period for caller to reconnect before marking as ended
      setTimeout(async () => {
        const still = activeCalls.get(session.targetId);
        if (!still || String(still.callerId) !== String(userId)) {
          await updateCallSession(session.sessionId, {
            status:     'ended',
            end_reason: 'network_error',
            ended_at:   new Date().toISOString(),
          });
          io.to(`user:${session.targetId}`).emit('call:ended', {
            from:      userId,
            sessionId: session.sessionId,
            reason:    'caller_disconnected',
          });
        }
      }, 15_000);
    }
  });
};
