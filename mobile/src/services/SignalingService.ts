/**
 * SignalingService – Centralized WebRTC & Socket.IO Signaling Engine.
 *
 * ❌ NO Agora, NO PeerJS, NO carrier network redirects.
 * ✅ Pure WebRTC signaling using the central Socket.IO gateway.
 * ✅ Operates flawlessly over low-quality routes, cellular data (LTE/5G), and WiFi.
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

  // ── Init ──────────────────────────────────────────────────────────────────

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
      console.log('[Signaling] ✅ Realtime gateway connected successfully');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Signaling] ⚠️ Socket connection disconnected:', reason);
    });

    // ── WebRTC Call Signaling Listeners ──────────────────────────────────────

    // 1. Incoming Call Event
    this.socket.on('call:incoming', async (data) => {
      console.log('[Signaling] 📲 Call incoming from gateway:', data);
      this.activeTargetId = data.from;
      this.activeConversationId = data.conversationId;
      this.activeCallType = data.callType === 'video' ? 'video' : 'audio';
      this.activeSessionId = data.sessionId;

      await CallService.displayIncomingCall({
        callerId: data.from,
        callerName: data.fromName || 'Someone',
        callType: data.callType || 'audio',
        conversationId: data.conversationId,
      });
    });

    // 2. Callee Accepted Call
    this.socket.on('call:answered', async (data) => {
      console.log('[Signaling] ✅ Peer answered our call – preparing WebRTC session');
      this.activeSessionId = data.sessionId;

      try {
        // Start caller peer connection, generate SDP offer
        const offer = await WebRTCService.startCall(this.activeCallType);
        
        // Emit WebRTC SDP offer through signaling pathway
        this.emit('call:signal', {
          to: this.activeTargetId,
          signal: offer,
          sessionId: this.activeSessionId,
        });

        // Trigger ICE buffering playout
        this.emit('call:request-buffered-ice', {
          sessionId: this.activeSessionId,
          fromUserId: this.activeTargetId,
        });
      } catch (err) {
        console.error('[Signaling] Failed to start WebRTC negotiation as caller:', err);
        await this.endActiveCall();
      }
    });

    // 3. WebRTC Signal Relay (SDP offer / answer)
    this.socket.on('call:signal', async (data) => {
      const { signal } = data;
      console.log(`[Signaling] 📡 WebRTC SDP signal received: ${signal.type}`);

      try {
        if (signal.type === 'offer') {
          // Callee accepts SDP offer and responds with answer SDP
          const answer = await WebRTCService.handleIncomingOffer(signal, this.activeCallType);
          this.emit('call:signal', {
            to: this.activeTargetId,
            signal: answer,
            sessionId: this.activeSessionId,
          });

          // Connected on answering side (connecting phase transition)
          CallService.onCallConnected();
        } else if (signal.type === 'answer') {
          // Caller receives remote answer SDP
          await WebRTCService.handleAnswer(signal);
          CallService.onCallConnected();
        }
      } catch (err) {
        console.error('[Signaling] Failed to process incoming signaling payload:', err);
      }
    });

    // 4. ICE candidate trickle pass-through
    this.socket.on('call:ice-candidate', async (data) => {
      if (data.candidate) {
        await WebRTCService.addIceCandidate(data.candidate);
      }
    });

    // 5. Remote ended call
    this.socket.on('call:ended', async () => {
      console.log('[Signaling] 📵 Remote hang-up received');
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('remote');
      this.resetState();
    });

    // 6. Callee rejected our call
    this.socket.on('call:rejected', async () => {
      console.log('[Signaling] 🚫 Peer declined the call');
      await WebRTCService.leaveChannel();
      await CallService.rejectCall();
      this.resetState();
    });

    // 7. Call Ringing Timeout
    this.socket.on('call:timeout', async () => {
      console.log('[Signaling] ⏱️ Call connection ring-timeout reached');
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('timeout');
      this.resetState();
    });
  }

  // ── Disconnect & Cleanup ──────────────────────────────────────────────────

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
      console.warn(`[Signaling] Connection is offline – dropping realtime event: ${event}`);
      return;
    }
    this.socket.emit(event, data);
  }

  // ── Signaling Actions ─────────────────────────────────────────────────────

  async startCall(
    targetUserId: string,
    targetName: string,
    type: 'audio' | 'video',
    conversationId: string
  ) {
    console.log(`[Signaling] 📞 Initiating WebRTC ${type} call to peer: ${targetUserId}`);
    this.activeTargetId = targetUserId;
    this.activeConversationId = conversationId;
    this.activeCallType = type;

    await CallService.startOutgoingCall({
      callerId: targetUserId,
      callerName: targetName,
      callType: type,
      conversationId,
    });

    // Register callback parameters for native WebRTC engine
    WebRTCService.registerCallbacks({
      onIceCandidate: (candidate) => {
        this.emit('call:ice-candidate', {
          to: this.activeTargetId,
          candidate,
          sessionId: this.activeSessionId,
        });
      },
    });

    // Emit initial signaling wake-up event
    this.emit('call:initiate', {
      to: targetUserId,
      callType: type,
      conversationId,
    });
  }

  async answerCall() {
    console.log('[Signaling] Answering incoming WebRTC call...');
    await CallService.answerCall();

    // Register callback parameters for native WebRTC engine
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
    console.log('[Signaling] Rejecting incoming call session');
    this.emit('call:reject', {
      to: this.activeTargetId,
      sessionId: this.activeSessionId,
    });

    await WebRTCService.leaveChannel();
    await CallService.rejectCall();
    this.resetState();
  }

  async endActiveCall() {
    console.log('[Signaling] Triggering explicit end call hang-up sequence');
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
