/**
 * SignalingService – WebRTC Signaling Engine (WhatsApp/Telegram pattern).
 *
 * CALLER FLOW:
 *  1. startCall() → acquireMedia() → emit call:initiate
 *  2. call:answered → createPeerConnectionAndOffer() → emit call:signal(offer)
 *  3. call:signal(answer) → handleAnswer() + request buffered ICE
 *
 * CALLEE FLOW:
 *  1. call:incoming → displayIncomingCall()
 *  2. answerCall() → acquireMedia() → prepareForIncomingCall() → emit call:answer
 *  3. call:signal(offer) → handleOffer() → emit call:signal(answer) + request buffered ICE
 */
import { io, Socket } from 'socket.io-client';
import CallService from './CallService';
import WebRTCService from './WebRTCService';
import { GATEWAY_URL } from '../Config';

class SignalingService {
  private socket:               Socket | null = null;
  private userId:               string | null = null;
  public  activeTargetId:       string | null = null;
  public  activeConversationId: string | null = null;
  public  activeCallType:       'audio' | 'video' = 'audio';
  public  activeSessionId:      string | null = null;

  async init(userToken: string, userId: string) {
    if (this.socket?.connected) {
      console.log('[Signaling] Reusing existing connection');
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

    this.socket.on('connect',    () => console.log('[Signaling] ✅ Connected'));
    this.socket.on('disconnect', (r) => console.warn('[Signaling] ⚠️ Disconnected:', r));

    // ── 1. Incoming call ───────────────────────────────────────────────────
    this.socket.on('call:incoming', async (data) => {
      console.log('[Signaling] 📲 Incoming call:', data);
      this.activeTargetId       = data.from;
      this.activeConversationId = data.conversationId;
      this.activeCallType       = data.callType === 'video' ? 'video' : 'audio';
      this.activeSessionId      = data.sessionId;

      await CallService.displayIncomingCall({
        callerId:       data.from,
        callerName:     data.fromName || 'Someone',
        callType:       data.callType || 'audio',
        conversationId: data.conversationId,
        sessionId:      data.sessionId,
      });
    });

    // ── 2. Caller: callee answered — now create PC and send offer ──────────
    this.socket.on('call:answered', async (data) => {
      const { sessionId } = data;
      if (sessionId && this.activeSessionId && sessionId !== this.activeSessionId) {
        console.warn('[Signaling] Ignoring stray call:answered for session:', sessionId);
        return;
      }
      console.log('[Signaling] ✅ Callee answered — creating offer');
      this.activeSessionId = sessionId || this.activeSessionId;

      const targetId = this.activeTargetId;
      const sessId   = this.activeSessionId;

      try {
        // Register ICE callback BEFORE creating the PC so no candidates are missed
        WebRTCService.registerCallbacks({
          onIceCandidate: (candidate) => {
            this.emit('call:ice-candidate', { to: targetId, candidate, sessionId: sessId });
          },
        });

        // Phase 2a: create PC + add already-acquired tracks + create offer
        const offer = await WebRTCService.createPeerConnectionAndOffer();
        this.emit('call:signal', { to: targetId, signal: offer, sessionId: sessId });
      } catch (err) {
        console.error('[Signaling] createPeerConnectionAndOffer failed:', err);
        await this.endActiveCall();
      }
    });

    // ── 3. SDP relay ───────────────────────────────────────────────────────
    this.socket.on('call:signal', async (data) => {
      const { signal, from, sessionId } = data;
      if (sessionId && this.activeSessionId && sessionId !== this.activeSessionId) {
        console.warn('[Signaling] Ignoring stray call:signal for session:', sessionId);
        return;
      }
      console.log(`[Signaling] 📡 SDP: ${signal.type} from ${from} session: ${sessionId}`);

      try {
        if (signal.type === 'offer') {
          // CALLEE: PC already exists (created in answerCall) — just set remote desc
          const answer = await WebRTCService.handleOffer(signal);
          this.emit('call:signal', { to: from, signal: answer, sessionId: sessionId || this.activeSessionId });
          // Request any ICE candidates the caller buffered while waiting
          this.emit('call:request-buffered-ice', { sessionId: sessionId || this.activeSessionId, fromUserId: from });

        } else if (signal.type === 'answer') {
          // CALLER: set remote description from callee's answer
          await WebRTCService.handleAnswer(signal);
          // Request any ICE candidates the callee buffered while creating their answer
          this.emit('call:request-buffered-ice', { sessionId: sessionId || this.activeSessionId, fromUserId: from });
        }
      } catch (err) {
        console.error('[Signaling] SDP handling failed:', err);
      }
    });

    // ── 4. ICE trickle ─────────────────────────────────────────────────────
    this.socket.on('call:ice-candidate', async (data) => {
      const { candidate, sessionId } = data;
      if (sessionId && this.activeSessionId && sessionId !== this.activeSessionId) {
        console.warn('[Signaling] Ignoring stray call:ice-candidate for session:', sessionId);
        return;
      }
      if (candidate) await WebRTCService.addIceCandidate(candidate);
    });

    // ── 5. Remote ended ────────────────────────────────────────────────────
    this.socket.on('call:ended', async () => {
      console.log('[Signaling] 📵 Remote ended call');
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('remote');
      this.resetState();
    });

    // ── 6. Call rejected ────────────────────────────────────────────────────
    this.socket.on('call:rejected', async () => {
      console.log('[Signaling] 🚫 Call declined');
      await WebRTCService.leaveChannel();
      await CallService.rejectCall();
      this.resetState();
    });

    // ── 7. Timeout ─────────────────────────────────────────────────────────
    this.socket.on('call:timeout', async () => {
      console.log('[Signaling] ⏱️ Ring timeout');
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('timeout');
      this.resetState();
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Caller initiates a call.
   * Acquires media IMMEDIATELY so the caller has mic/camera ready while ringing.
   */
  async startCall(targetUserId: string, targetName: string, type: 'audio' | 'video', conversationId: string) {
    console.log(`[Signaling] 📞 Initiating ${type} call to ${targetUserId}`);
    this.activeTargetId       = targetUserId;
    this.activeConversationId = conversationId;
    this.activeCallType       = type;

    await CallService.startOutgoingCall({ callerId: this.userId ?? '', callerName: targetName, callType: type, conversationId });

    // Phase 1: acquire media now — caller gets camera/mic while callee's phone rings
    await WebRTCService.acquireMedia(type);

    this.emit('call:initiate', { to: targetUserId, callType: type, conversationId });
  }

  /**
   * Callee answers the call.
   * Acquires media, creates PC with tracks, THEN tells the caller we're ready.
   * The caller will send the SDP offer only after receiving call:answer.
   */
  async answerCall() {
    console.log('[Signaling] Answering call...');
    await CallService.answerCall();

    // Phase 1: acquire media
    await WebRTCService.acquireMedia(this.activeCallType);

    const targetId = this.activeTargetId;
    const sessId   = this.activeSessionId;

    // Register ICE callback before creating PC so no candidates are dropped
    WebRTCService.registerCallbacks({
      onIceCandidate: (candidate) => {
        this.emit('call:ice-candidate', { to: targetId, candidate, sessionId: sessId });
      },
    });

    // Phase 2b: create PC and add local tracks — PC is ready for the incoming offer
    await WebRTCService.prepareForIncomingCall();

    // NOW tell the caller we're ready — offer will arrive to a fully prepared PC
    this.emit('call:answer', { to: targetId, sessionId: sessId });
    console.log('[Signaling] call:answer emitted — PC ready for offer');
  }

  async rejectIncomingCall() {
    console.log('[Signaling] Rejecting call');
    this.emit('call:reject', { to: this.activeTargetId, sessionId: this.activeSessionId });
    await WebRTCService.leaveChannel();
    await CallService.rejectCall();
    this.resetState();
  }

  async endActiveCall() {
    console.log('[Signaling] Ending call');
    if (this.activeTargetId) {
      this.emit('call:end', { to: this.activeTargetId, sessionId: this.activeSessionId, conversationId: this.activeConversationId });
    }
    await WebRTCService.leaveChannel();
    await CallService.handleCallEnded('normal');
    this.resetState();
  }

  cancelActiveCall() { this.endActiveCall(); }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  private resetState() {
    this.activeTargetId       = null;
    this.activeConversationId = null;
    this.activeSessionId      = null;
  }

  private emit(event: string, data: any) {
    if (!this.socket?.connected) { console.warn(`[Signaling] Offline — dropping: ${event}`); return; }
    this.socket.emit(event, data);
  }
}

export default new SignalingService();
