/**
 * SignalingService – Pure Socket.IO based in-app VoIP signaling.
 *
 * ❌ No RNCallKeep, no Telecom, no tel: links, no GSM dialer.
 * ✅ WebSocket signaling only — works on WiFi + mobile data.
 *
 * Flow (outgoing):
 *   1. Caller emits  call:initiate → gateway
 *   2. Gateway relays call:incoming → callee
 *   3. Callee answers → emits call:ready → gateway
 *   4. Gateway relays call:ready → caller
 *   5. Both join Agora channel
 *
 * Flow (incoming):
 *   1. Receive call:incoming → show in-app UI via CallService
 *   2. User answers → emit call:ready
 *   3. Join Agora channel
 */
import { io, Socket } from 'socket.io-client';
import CallService from './CallService';
import AgoraService from './AgoraService';
import { GATEWAY_URL } from '../Config';

class SignalingService {
  private socket: Socket | null = null;
  private userId: string | null = null;
  public activeTargetId: string | null = null;
  public activeConversationId: string | null = null;

  // ── Init ──────────────────────────────────────────────────────────────────

  async init(userToken: string, userId: string) {
    // Prevent duplicate connections
    if (this.socket?.connected) {
      console.log('[Signaling] Already connected – reusing socket');
      return;
    }

    this.userId = userId;

    this.socket = io(GATEWAY_URL, {
      auth: { token: userToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[Signaling] ✅ Connected to gateway');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Signaling] ⚠️ Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Signaling] ❌ Connection error:', err.message);
    });

    // ── Incoming call from remote peer ──────────────────────────────────────
    this.socket.on('call:incoming', async (data) => {
      console.log('[Signaling] 📲 Incoming call:', data);
      this.activeTargetId = data.from;
      this.activeConversationId = data.conversationId;

      await CallService.displayIncomingCall({
        callerId: data.from,
        callerName: data.fromName || 'Unknown',
        callType: data.type || 'audio',
        conversationId: data.conversationId,
      });
    });

    // ── Remote peer accepted our call ───────────────────────────────────────
    this.socket.on('call:ready', async (data) => {
      console.log('[Signaling] ✅ Remote peer ready');
      try {
        await AgoraService.joinChannel(this.activeConversationId!);
        CallService.onCallConnected();
      } catch (err) {
        console.error('[Signaling] Agora join failed on ready:', err);
        CallService.handleCallEnded('error');
      }
    });

    // ── Remote ended / rejected / timed out ─────────────────────────────────
    this.socket.on('call:ended', async () => {
      console.log('[Signaling] 📵 Remote ended call');
      await AgoraService.leaveChannel();
      await CallService.handleCallEnded('remote');
    });

    this.socket.on('call:rejected', async () => {
      console.log('[Signaling] 🚫 Remote rejected call');
      await AgoraService.leaveChannel();
      await CallService.rejectCall();
    });

    this.socket.on('call:timeout', async () => {
      console.log('[Signaling] ⏱️ Call timed out (signaling)');
      await AgoraService.leaveChannel();
      await CallService.handleCallEnded('timeout');
    });
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ── Emit helpers ──────────────────────────────────────────────────────────

  private emit(event: string, data: any) {
    if (!this.socket?.connected) {
      console.warn(`[Signaling] Cannot emit ${event} – socket not connected`);
      return;
    }
    this.socket.emit(event, data);
  }

  // ── Start outgoing call ───────────────────────────────────────────────────

  async startCall(
    targetUserId: string,
    targetName: string,
    type: 'audio' | 'video',
    conversationId: string
  ) {
    console.log(`[Signaling] 📞 Initiating ${type} call to ${targetUserId}`);
    this.activeTargetId = targetUserId;
    this.activeConversationId = conversationId;

    await CallService.startOutgoingCall({
      callerId: targetUserId,
      callerName: targetName,
      callType: type,
      conversationId,
    });

    // Join Agora pre-emptively so we're ready when remote answers
    try {
      await AgoraService.joinChannel(conversationId);
    } catch (err) {
      console.error('[Signaling] Agora join failed (outgoing):', err);
    }

    this.emit('call:initiate', {
      to: targetUserId,
      type,
      conversationId,
      fromId: this.userId,
    });
  }

  // ── Answer incoming call ──────────────────────────────────────────────────

  async answerCall() {
    await CallService.answerCall();

    this.emit('call:ready', {
      to: this.activeTargetId,
      conversationId: this.activeConversationId,
    });

    try {
      await AgoraService.joinChannel(this.activeConversationId!);
      CallService.onCallConnected();
    } catch (err) {
      console.error('[Signaling] Agora join failed on answer:', err);
      await this.endActiveCall();
    }
  }

  // ── Reject incoming call ──────────────────────────────────────────────────

  async rejectIncomingCall() {
    this.emit('call:reject', { to: this.activeTargetId });
    await AgoraService.leaveChannel();
    await CallService.rejectCall();
    this.activeTargetId = null;
    this.activeConversationId = null;
  }

  // ── End / cancel any active call ──────────────────────────────────────────

  async endActiveCall() {
    if (this.activeTargetId) {
      this.emit('call:end', {
        to: this.activeTargetId,
        conversationId: this.activeConversationId,
      });
    }
    await AgoraService.leaveChannel();
    await CallService.handleCallEnded('normal');
    this.activeTargetId = null;
    this.activeConversationId = null;
  }

  // ── Kept for backward compat with CallScreen ──────────────────────────────
  cancelActiveCall() {
    this.endActiveCall();
  }
}

export default new SignalingService();
