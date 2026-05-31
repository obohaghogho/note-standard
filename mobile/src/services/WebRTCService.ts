/**
 * WebRTCService – Native WebRTC peer connection manager.
 *
 * ARCHITECTURE (WhatsApp/Telegram pattern):
 *  Phase 1 — acquireMedia(): permissions + ICE servers + getUserMedia
 *             Called as early as possible (when user taps Call or Answer)
 *  Phase 2 — initiatePeerConnection(): create PC + add local tracks
 *             Caller calls this after callee answers (call:answered)
 *             Callee calls this before emitting call:answer
 *  Phase 3 — createOffer() / handleOffer() / handleAnswer(): SDP exchange
 *             Never creates a new PC — works on the existing one
 */
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
  registerGlobals,
} from 'react-native-webrtc';
import { Platform, PermissionsAndroid } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import apiClient from '../api/apiClient';

registerGlobals();

export type WebRTCConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream:    MediaStream | null = null;
  private remoteStream:   MediaStream | null = null;

  // Track references for persistent stream object (prevents black video)
  private remoteAudioTrack: any = null;
  private remoteVideoTrack: any = null;

  private iceServers:              any[]    = [];
  private pendingCandidates:       any[]    = [];
  private remoteDescriptionSet     = false;
  private mediaAcquired            = false;
  private currentCallType: 'audio' | 'video' = 'audio';

  private onConnectionStateChangeCallback: ((state: WebRTCConnectionState, iceState?: string) => void) | null = null;
  private onRemoteStreamCallback:          ((stream: MediaStream | null) => void) | null = null;
  private onIceCandidateCallback:          ((candidate: any) => void) | null = null;

  // ── Phase 1: Permissions + ICE servers + getUserMedia ─────────────────────
  // Call this as soon as the user initiates or accepts a call.
  async acquireMedia(callType: 'audio' | 'video' = 'audio'): Promise<void> {
    this.currentCallType = callType;

    if (Platform.OS === 'android') {
      const granted = await this.requestAndroidPermissions(callType);
      if (!granted) throw new Error('Camera/Microphone permissions not granted');
    }

    // Fetch ICE servers (cached after first call)
    if (this.iceServers.length === 0) {
      try {
        const response = await apiClient.get('/webrtc/ice-servers');
        this.iceServers = response.data.iceServers || [];
        console.log('[WebRTC] ICE servers fetched:', this.iceServers.length);
      } catch (err) {
        console.warn('[WebRTC] ICE fetch failed — using STUN fallback');
        this.iceServers = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ];
      }
    }

    // Stop any existing local stream before acquiring new one
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
      try { (this.localStream as any).release?.(); } catch (_) {}
      this.localStream = null;
    }

    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: callType === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } : false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamPromise = mediaDevices.getUserMedia(constraints as any) as unknown as Promise<MediaStream>;
    const timeout = new Promise<MediaStream>((_, rej) =>
      setTimeout(() => rej(new Error('getUserMedia timeout — hardware may be locked')), 7000)
    );
    this.localStream  = await Promise.race([streamPromise, timeout]);
    this.mediaAcquired = true;
    console.log('[WebRTC] Local media acquired');

    InCallManager.start({ media: callType === 'video' ? 'video' : 'audio' });
  }

  // ── Phase 2a: Create PC + add tracks (CALLER — called after call:answered) ─
  // Returns the SDP offer to send to the callee.
  async createPeerConnectionAndOffer(): Promise<RTCSessionDescription> {
    if (!this.mediaAcquired || !this.localStream) {
      throw new Error('[WebRTC] acquireMedia() must be called before createPeerConnectionAndOffer()');
    }

    this.buildPeerConnection();
    this.addLocalTracks();

    const offer = await this.peerConnection!.createOffer({});
    const munged = { type: offer.type, sdp: this.enforceH264(offer.sdp || '') };
    await this.peerConnection!.setLocalDescription(munged);
    console.log('[WebRTC] Offer created and local description set');
    return munged as RTCSessionDescription;
  }

  // ── Phase 2b: Create PC + add tracks (CALLEE — called before emitting call:answer) ─
  async prepareForIncomingCall(): Promise<void> {
    if (!this.mediaAcquired || !this.localStream) {
      throw new Error('[WebRTC] acquireMedia() must be called before prepareForIncomingCall()');
    }
    this.buildPeerConnection();
    this.addLocalTracks();
    console.log('[WebRTC] Callee PC ready and tracks added');
  }

  // ── Phase 3a: Callee handles incoming offer (NO new PC creation) ──────────
  async handleOffer(offerSdp: any): Promise<RTCSessionDescription> {
    if (!this.peerConnection) {
      throw new Error('[WebRTC] No PeerConnection — prepareForIncomingCall() was not called');
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
    this.remoteDescriptionSet = true;
    console.log('[WebRTC] Remote offer set — draining ICE queue');
    await this.drainPendingCandidates();

    const answer = await this.peerConnection.createAnswer();
    const munged = { type: answer.type, sdp: this.enforceH264(answer.sdp || '') };
    await this.peerConnection.setLocalDescription(munged);
    console.log('[WebRTC] Answer created and local description set');
    return munged as RTCSessionDescription;
  }

  // ── Phase 3b: Caller handles incoming answer ──────────────────────────────
  async handleAnswer(answerSdp: any): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
    this.remoteDescriptionSet = true;
    console.log('[WebRTC] Remote answer set — draining ICE queue');
    await this.drainPendingCandidates();
  }

  // ── ICE candidate ─────────────────────────────────────────────────────────
  async addIceCandidate(candidate: any): Promise<void> {
    if (!this.peerConnection) { this.pendingCandidates.push(candidate); return; }
    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidate); return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[WebRTC] addIceCandidate error:', e);
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private buildPeerConnection(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    // Do NOT wipe pendingCandidates here to preserve early trickled candidates.
    // They are already cleared on leaveChannel() when the call ends.
    this.remoteDescriptionSet = false;
    this.remoteAudioTrack     = null;
    this.remoteVideoTrack     = null;

    const config = { iceServers: this.iceServers, iceTransportPolicy: 'all' as RTCIceTransportPolicy };
    console.log('[WebRTC] Building PeerConnection with', this.iceServers.length, 'ICE servers');
    this.peerConnection = new RTCPeerConnection(config);

    // ── Event handlers via addEventListener (EventTarget API for react-native-webrtc v124)
    // Source confirmed: RTCPeerConnection.ts dispatches all events via EventTarget.dispatchEvent().
    // Property handlers (pc.onX = fn) also work for EventTarget events, but we standardize
    // on addEventListener for clarity. The ICE candidate handler uses the native bridge listener.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pcAny = this.peerConnection as any;

    pcAny.addEventListener('connectionstatechange', () => {
      const state = (this.peerConnection?.connectionState) as WebRTCConnectionState;
      const ice   = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] Connection: ${state} | ICE: ${ice}`);
      this.onConnectionStateChangeCallback?.(state, ice);
      if (state === 'connected' && this.remoteStream) {
        this.onRemoteStreamCallback?.(this.remoteStream);
      }
    });

    pcAny.addEventListener('iceconnectionstatechange', () => {
      const state = (this.peerConnection?.connectionState) as WebRTCConnectionState;
      const ice   = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] ICE: ${ice}`);
      this.onConnectionStateChangeCallback?.(state, ice);
    });

    pcAny.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) this.onIceCandidateCallback?.(event.candidate);
    });

    // ── track: stream delivery ─────────────────────────────────────────────────
    // react-native-webrtc v124 source (RTCPeerConnection.ts:285-305):
    //   const streams = ev.streams.map(streamInfo => { ... this._remoteStreams.set(...) })
    //   this.dispatchEvent(new RTCTrackEvent('track', { streams, track, ... }))
    //
    // event.streams[0] is a natively-registered MediaStream built from remote SDP a=msid.
    // If ev.streams was empty at native level, we fall back to pc._remoteStreams which is
    // always populated by setRemoteDescription from the SDP stream IDs.
    pcAny.addEventListener('track', (event: any) => {
      const track = event.track;
      if (!track) return;
      console.log('[WebRTC] track kind:', track.kind, 'streams:', event.streams?.length);

      if (track.kind === 'audio') this.remoteAudioTrack = track;
      if (track.kind === 'video') this.remoteVideoTrack = track;

      let stream = event.streams && event.streams[0];

      if (!stream) {
        // _remoteStreams is the PC's internal registry built from SDP a=msid during sRD.
        // Falls back here when peer's a=msid is missing or stream not yet associated.
        const registry: Map<string, any> = pcAny._remoteStreams;
        if (registry && registry.size > 0) {
          stream = Array.from(registry.values())[0];
          console.log('[WebRTC] track: _remoteStreams fallback, tracks:', stream?.getTracks?.()?.length);
        }
      }

      if (stream) {
        this.remoteStream = stream;
        this.onRemoteStreamCallback?.(stream);
      } else {
        console.warn('[WebRTC] track: no stream found — will retry on connectionstatechange=connected');
      }
    });

  }

  private addLocalTracks(): void {
    if (!this.localStream || !this.peerConnection) return;
    this.localStream.getTracks().forEach(track => {
      const senders = this.peerConnection?.getSenders() || [];
      const has = senders.some(s => s.track?.kind === track.kind);
      if (!has) {
        this.peerConnection?.addTrack(track, this.localStream!);
        console.log(`[WebRTC] Track added for ${track.kind}`);
      }
    });
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.peerConnection || this.pendingCandidates.length === 0) return;
    console.log(`[WebRTC] Draining ${this.pendingCandidates.length} pending ICE candidates`);
    const batch = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const c of batch) {
      try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn('[WebRTC] Drain ICE error:', e); }
    }
  }

  // H264 enforcement intentionally removed.
  // Manually reordering H264 codec payload types in the m=video line causes
  // profile-level-id mismatches between Android (42e01f / 640c28) and iOS (42001f).
  // This makes iOS video silently fail to decode on Android while still appearing
  // to negotiate successfully — causing exactly the one-directional video bug.
  // WebRTC auto-negotiates the best common codec (VP8 universally, or compatible H264).
  private enforceH264(sdp: string): string { return sdp; }


  private async requestAndroidPermissions(callType: 'audio' | 'video'): Promise<boolean> {
    const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (callType === 'video') perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const results = await PermissionsAndroid.requestMultiple(perms);
    const audio = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
    const cam   = callType !== 'video' || results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
    return audio && cam;
  }

  // ── Media controls ────────────────────────────────────────────────────────

  getLocalStream  = (): MediaStream | null => this.localStream;
  getRemoteStream = (): MediaStream | null => this.remoteStream;

  muteLocalAudio(mute: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !mute; });
  }

  setEnableSpeakerphone(enabled: boolean): void {
    InCallManager.setForceSpeakerphoneOn(enabled);
  }

  switchCamera(): void {
    this.localStream?.getVideoTracks().forEach(track => {
      // @ts-ignore
      if (typeof track._switchCamera === 'function') track._switchCamera();
    });
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  registerCallbacks(handlers: {
    onConnectionStateChange?: (state: WebRTCConnectionState, iceState?: string) => void;
    onRemoteStream?: (stream: MediaStream | null) => void;
    onIceCandidate?: (candidate: any) => void;
  }): void {
    if (handlers.onConnectionStateChange) this.onConnectionStateChangeCallback = handlers.onConnectionStateChange;
    if (handlers.onRemoteStream)          this.onRemoteStreamCallback          = handlers.onRemoteStream;
    if (handlers.onIceCandidate)          this.onIceCandidateCallback          = handlers.onIceCandidate;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async leaveChannel(): Promise<void> {
    console.log('[WebRTC] leaveChannel — releasing all resources');
    InCallManager.stop();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => { try { t.enabled = false; t.stop(); } catch (_) {} });
      try { (this.localStream as any).release?.(); } catch (_) {}
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      this.remoteStream = null;
    }
    if (this.peerConnection) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pc = this.peerConnection as any;
      pc.onconnectionstatechange    = null;
      pc.oniceconnectionstatechange = null;
      pc.onicecandidate             = null;
      pc.ontrack                    = null;
      this.peerConnection.getSenders().forEach(s => { try { s.track?.stop(); } catch (_) {} });
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteAudioTrack     = null;
    this.remoteVideoTrack     = null;
    this.pendingCandidates    = [];
    this.remoteDescriptionSet = false;
    this.mediaAcquired        = false;
    this.iceServers           = []; // allow re-fetch on next call

    this.onRemoteStreamCallback?.(null);
    this.onConnectionStateChangeCallback = null;
    this.onRemoteStreamCallback          = null;
    this.onIceCandidateCallback          = null;
  }

  destroy(): void { this.leaveChannel(); }
}

export default new WebRTCService();
