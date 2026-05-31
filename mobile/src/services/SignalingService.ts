/**
 * SignalingService – Centralized WebRTC & Socket.IO Signaling Engine.
 *
 * FIXES:
 *  - Bug 2: Removed premature CallService.onCallConnected() from call:signal handler.
 *  - Bug 5: Caller requests buffered ICE AFTER receiving SDP answer, not after sending offer.
 */
import { io, Socket } from 'socket.io-client';
import CallService from './CallService';
import WebRTCService from './WebRTCService';
import { GATEWAY_URL } from '../Config';

class SignalingService {
  private socket: Socket | null = null;
  private userId: string | null = null;
  public activeTargetId: string | null = null;
  public activeConversationId: string | null = null;
  public activeCallType: 'audio' | 'video' = 'audio';
  public activeSessionId: string | null = null;

  async init(userToken: string, userId: string) {
    if (this.socket?.connected) {
      console.log('[Signaling] Reusing existing Socket.IO connection');
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
      console.log('[Signaling] ✅ Realtime gateway connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Signaling] ⚠️ Socket disconnected:', reason);
    });

    // 1. Incoming Call
    this.socket.on('call:incoming', async (data) => {
      console.log('[Signaling] 📲 Incoming call:', data);
      this.activeTargetId = data.from;
      this.activeConversationId = data.conversationId;
      this.activeCallType = data.callType === 'video' ? 'video' : 'audio';
      this.activeSessionId = data.sessionId;

      await CallService.displayIncomingCall({
        callerId: data.from,
        callerName: data.fromName || 'Someone',
        callType: data.callType || 'audio',
        conversationId: data.conversationId,
        sessionId: data.sessionId,
      });
    });

    // 2. Peer answered — caller creates offer
    this.socket.on('call:answered', async (data) => {
      console.log('[Signaling] ✅ Peer answered — starting WebRTC negotiation');
      this.activeSessionId = data.sessionId;

      try {
        const offer = await WebRTCService.startCall(this.activeCallType);
        this.emit('call:signal', {
          to: this.activeTargetId,
          signal: offer,
          sessionId: this.activeSessionId,
        });
        // BUG FIX (Bug 5): Do NOT request buffered ICE here.
        // Callee hasn't gathered candidates yet; requesting now wipes an empty table.
        // ICE is requested after SDP answer is received below.
      } catch (err) {
        console.error('[Signaling] WebRTC negotiation failed:', err);
        await this.endActiveCall();
      }
    });

    // 3. SDP signal relay
    this.socket.on('call:signal', async (data) => {
      const { signal } = data;
      console.log(`[Signaling] 📡 SDP signal: ${signal.type}`);

      try {
        if (signal.type === 'offer') {
          // Callee: answer the offer
          const answer = await WebRTCService.handleIncomingOffer(signal, this.activeCallType);
          this.emit('call:signal', {
            to: this.activeTargetId,
            signal: answer,
            sessionId: this.activeSessionId,
          });
          // Callee requests ICE buffered from caller (caller has had time to gather)
          this.emit('call:request-buffered-ice', {
            sessionId: this.activeSessionId,
            fromUserId: this.activeTargetId,
          });
          // BUG FIX (Bug 2): Do NOT call CallService.onCallConnected() here.
          // ICE negotiation hasn't completed. Let onconnectionstatechange drive this.

        } else if (signal.type === 'answer') {
          // Caller: set remote description from callee's answer
          await WebRTCService.handleAnswer(signal);
          // BUG FIX (Bug 2): Do NOT call CallService.onCallConnected() here.
          // BUG FIX (Bug 5): NOW request buffered ICE from callee — they've had
          // time to gather candidates since we sent the offer.
          this.emit('call:request-buffered-ice', {
            sessionId: this.activeSessionId,
            fromUserId: this.activeTargetId,
          });
        }
      } catch (err) {
        console.error('[Signaling] Failed to process SDP signal:', err);
      }
    });

    // 4. ICE trickle
    this.socket.on('call:ice-candidate', async (data) => {
      if (data.candidate) {
        await WebRTCService.addIceCandidate(data.candidate);
      }
    });

    // 5. Remote ended
    this.socket.on('call:ended', async () => {
      console.log('[Signaling] 📵 Remote hang-up');
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('remote');
      this.resetState();
    });

    // 6. Call rejected
    this.socket.on('call:rejected', async () => {
      console.log('[Signaling] 🚫 Call declined');
      await WebRTCService.leaveChannel();
      await CallService.rejectCall();
      this.resetState();
    });

    // 7. Timeout
    this.socket.on('call:timeout', async () => {
      console.log('[Signaling] ⏱️ Ring timeout');
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('timeout');
      this.resetState();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private resetState() {
    this.activeTargetId = null;
    this.activeConversationId = null;
    this.activeSessionId = null;
  }

  private emit(event: string, data: any) {
    if (!this.socket?.connected) {
      console.warn(`[Signaling] Offline — dropping event: ${event}`);
      return;
    }
    this.socket.emit(event, data);
  }

  async startCall(
    targetUserId: string,
    targetName: string,
    type: 'audio' | 'video',
    conversationId: string
  ) {
    console.log(`[Signaling] 📞 Initiating ${type} call to ${targetUserId}`);
    this.activeTargetId = targetUserId;
    this.activeConversationId = conversationId;
    this.activeCallType = type;

    await CallService.startOutgoingCall({
      callerId: this.userId ?? '',
      callerName: targetName,
      callType: type,
      conversationId,
    });

    WebRTCService.registerCallbacks({
      onIceCandidate: (candidate) => {
        this.emit('call:ice-candidate', {
          to: this.activeTargetId,
          candidate,
          sessionId: this.activeSessionId,
        });
      },
    });

    this.emit('call:initiate', { to: targetUserId, callType: type, conversationId });
  }

  async answerCall() {
    console.log('[Signaling] Answering call...');
    await CallService.answerCall();

    WebRTCService.registerCallbacks({
      onIceCandidate: (candidate) => {
        this.emit('call:ice-candidate', {
          to: this.activeTargetId,
          candidate,
          sessionId: this.activeSessionId,
        });
      },
    });

    this.emit('call:answer', {
      to: this.activeTargetId,
      sessionId: this.activeSessionId,
    });
  }

  async rejectIncomingCall() {
    console.log('[Signaling] Rejecting call');
    this.emit('call:reject', {
      to: this.activeTargetId,
      sessionId: this.activeSessionId,
    });
    await WebRTCService.leaveChannel();
    await CallService.rejectCall();
    this.resetState();
  }

  async endActiveCall() {
    console.log('[Signaling] Ending call');
    if (this.activeTargetId) {
      this.emit('call:end', {
        to: this.activeTargetId,
        sessionId: this.activeSessionId,
        conversationId: this.activeConversationId,
      });
    }
    await WebRTCService.leaveChannel();
    await CallService.handleCallEnded('normal');
    this.resetState();
  }

  cancelActiveCall() {
    this.endActiveCall();
  }
}

export default new SignalingService();
