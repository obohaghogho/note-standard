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

    // react-native-webrtc uses slightly different event handler names — use bracket notation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.peerConnection as any).onconnectionstatechange = () => {
      const state = (this.peerConnection as any)?.connectionState as WebRTCConnectionState;
      const ice   = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] Connection: ${state} | ICE: ${ice}`);
      this.onConnectionStateChangeCallback?.(state, ice);

      // When connected, re-deliver remoteStream to the UI in case it arrived
      // before CallScreen had a chance to register its onRemoteStream callback.
      if (state === 'connected' && this.remoteStream) {
        console.log('[WebRTC] Connected — re-delivering remoteStream to callback');
        this.onRemoteStreamCallback?.(this.remoteStream);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.peerConnection as any).oniceconnectionstatechange = () => {
      const state = (this.peerConnection as any)?.connectionState as WebRTCConnectionState;
      const ice   = this.peerConnection?.iceConnectionState;
      this.onConnectionStateChangeCallback?.(state, ice);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.peerConnection as any).onicecandidate = (event: any) => {
      if (event.candidate) this.onIceCandidateCallback?.(event.candidate);
    };

    // Persistent remote stream — audio and video tracks are added as they arrive.
    // This prevents the black screen bug from recreating the stream on every ontrack.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.peerConnection as any).ontrack = (event: any) => {
      const track = event.track;
      if (!track) {
        console.warn('[WebRTC] ontrack fired but no track in event');
        return;
      }

      console.log('[WebRTC] ontrack kind:', track.kind, 'id:', track.id, 'streams:', event.streams?.length);

      // Prefer event.streams[0] which is populated when the peer uses addTrack(track, stream).
      // However, on Android (react-native-webrtc) event.streams can be empty even with valid
      // tracks. In that case, we build/update a persistent remoteStream from the track directly.
      let stream = event.streams && event.streams[0];

      if (!stream) {
        console.warn('[WebRTC] ontrack: event.streams empty — building persistent stream from track (Android fallback)');
        if (!this.remoteStream) {
          // First track: create the stream
          this.remoteStream = new MediaStream([track]);
        } else {
          // Subsequent tracks: add to existing stream if not already present
          const already = (this.remoteStream as any).getTracks?.()?.some((t: any) => t.id === track.id);
          if (!already) {
            (this.remoteStream as any).addTrack(track);
          }
        }
        stream = this.remoteStream;
      }

      if (track.kind === 'audio') this.remoteAudioTrack = track;
      if (track.kind === 'video') this.remoteVideoTrack = track;

      this.remoteStream = stream;
      console.log('[WebRTC] remoteStream now has', (stream as any).getTracks?.()?.length, 'tracks');
      this.onRemoteStreamCallback?.(stream);
    };
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

  private enforceH264(sdp: string): string {
    if (!sdp) return sdp;
    const lines = sdp.split('\r\n');
    const mIdx  = lines.findIndex(l => l.startsWith('m=video'));
    if (mIdx === -1) return sdp;
    const h264Payloads: string[] = [];
    lines.forEach(l => {
      if (l.startsWith('a=rtpmap:') && l.toLowerCase().includes('h264')) {
        const m = l.match(/a=rtpmap:(\d+)/);
        if (m) h264Payloads.push(m[1]);
      }
    });
    if (h264Payloads.length === 0) return sdp;
    const parts = lines[mIdx].split(' ');
    if (parts.length < 4) return sdp;
    const rest = parts.slice(3).filter(pt => !h264Payloads.includes(pt));
    lines[mIdx] = [...parts.slice(0, 3), ...h264Payloads, ...rest].join(' ');
    return lines.join('\r\n');
  }

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
