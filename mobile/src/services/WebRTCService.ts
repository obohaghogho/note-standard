/**
 * WebRTCService – Native WebRTC peer connection manager.
 * Replaces AgoraService entirely.
 *
 * Uses react-native-webrtc to manage:
 *  - Local media streams (camera and microphone)
 *  - RTCPeerConnection lifecycle
 *  - Dynamic ICE configuration (STUN + TURN fallback)
 *  - Native device media controls (speaker, mute, front/back camera switch)
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

// Register global WebRTC classes for compatibility if needed
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
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioTrack: any = null;
  private remoteVideoTrack: any = null;
  private isInitialized = false;
  private iceServers: any[] = [];
  private pendingCandidates: any[] = []; // queued until setRemoteDescription done
  private remoteDescriptionPromise: Promise<void> | null = null;
  
  // Callbacks for UI updates
  private onConnectionStateChangeCallback: ((state: WebRTCConnectionState, iceState?: string) => void) | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream | null) => void) | null = null;
  private onIceCandidateCallback: ((candidate: any) => void) | null = null;
  private onSignalCallback: ((signal: any) => void) | null = null;

  // ── Initialization & Permissions ──────────────────────────────────────────

  async init(callType: 'audio' | 'video' = 'audio') {
    if (this.isInitialized) return;

    if (Platform.OS === 'android') {
      const granted = await this.requestAndroidPermissions(callType);
      if (!granted) {
        throw new Error('Required permissions (Camera/Microphone) not granted');
      }
    }

    try {
      // Fetch dynamic STUN/TURN configurations from our centralized backend WebRTC API
      const response = await apiClient.get('/webrtc/ice-servers');
      this.iceServers = response.data.iceServers || [];
      
      // Production Hardening: Enforce TURN relays in production to prevent STUN-only cell network failure
      const hasTurn = this.iceServers.some((server: any) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some((url: string) => url && (url.startsWith('turn:') || url.startsWith('turns:')));
      });

      if (!hasTurn) {
        console.error('[WebRTC] 🚨 CRITICAL ERROR: TURN server configuration is missing from backend response!');
        // Throw in non-dev builds to prevent silent connection drop bugs
        if (!__DEV__) {
          throw new Error('Production VoIP calls require operational TURN relay servers.');
        }
      }
      console.log('[WebRTC] Dynamically fetched ICE servers successfully');
    } catch (err) {
      console.warn('[WebRTC] Failed to fetch ice servers from backend, falling back to STUN-only', err);
      this.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
    }

    this.isInitialized = true;
  }

  private async requestAndroidPermissions(callType: 'audio' | 'video' = 'audio'): Promise<boolean> {
    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (callType === 'video') {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }
    
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const audioGranted = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
    const cameraGranted = callType === 'video' 
      ? results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED 
      : true;

    return audioGranted && cameraGranted;
  }

  // ── Connection Management ──────────────────────────────────────────────────

  async startCall(callType: 'audio' | 'video' = 'audio'): Promise<RTCSessionDescription> {
    await this.init(callType);
    await this.setupLocalStream(callType);
    this.createPeerConnection();

    // Add local tracks to peer connection using Transceivers instead of addTrack
    // This is critical for iOS to ensure proper bidirectional negotiation
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        const existingTransceivers = this.peerConnection?.getTransceivers() || [];
        const hasKind = existingTransceivers.some(t => t.sender && t.sender.track && t.sender.track.kind === track.kind);
        if (!hasKind) {
          this.peerConnection?.addTransceiver(track, {
            direction: 'sendrecv',
            streams: [this.localStream!]
          });
          console.log(`[WebRTC] Added transceiver for ${track.kind}`);
        } else {
          console.log(`[WebRTC] Transceiver for ${track.kind} already exists. Skipping.`);
        }
      });
    }

    // Create SDP Offer
    const offer = await this.peerConnection!.createOffer({});
    const mungedSdp = { type: offer.type, sdp: this.enforceH264(offer.sdp || '') };
    await this.peerConnection!.setLocalDescription(mungedSdp);
    console.log('[WebRTC Forensic] LOCAL SDP (Offer):', this.peerConnection!.localDescription?.sdp);
    
    // Start InCallManager for proper iOS audio routing
    InCallManager.start({ media: callType === 'video' ? 'video' : 'audio' });

    return mungedSdp;
  }

  async handleIncomingOffer(offerSdp: any, callType: 'audio' | 'video' = 'audio'): Promise<RTCSessionDescription> {
    await this.init(callType);
    await this.setupLocalStream(callType);
    this.createPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        const existingTransceivers = this.peerConnection?.getTransceivers() || [];
        const hasKind = existingTransceivers.some(t => t.sender && t.sender.track && t.sender.track.kind === track.kind);
        if (!hasKind) {
          this.peerConnection?.addTransceiver(track, {
            direction: 'sendrecv',
            streams: [this.localStream!]
          });
          console.log(`[WebRTC] Added transceiver for ${track.kind}`);
        } else {
          console.log(`[WebRTC] Transceiver for ${track.kind} already exists. Skipping.`);
        }
      });
    }

    this.remoteDescriptionPromise = this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offerSdp));
    await this.remoteDescriptionPromise;
    console.log('[WebRTC Forensic] REMOTE SDP (Offer):', this.peerConnection!.remoteDescription?.sdp);
    
    await this.drainPendingCandidates(); // flush any queued ICE candidates
    const answer = await this.peerConnection!.createAnswer();
    const mungedSdp = { type: answer.type, sdp: this.enforceH264(answer.sdp || '') };
    await this.peerConnection!.setLocalDescription(mungedSdp);
    console.log('[WebRTC Forensic] LOCAL SDP (Answer):', this.peerConnection!.localDescription?.sdp);
    
    // Start InCallManager for proper iOS audio routing
    InCallManager.start({ media: callType === 'video' ? 'video' : 'audio' });

    return mungedSdp;
  }

  async handleAnswer(answerSdp: any) {
    if (!this.peerConnection) return;
    this.remoteDescriptionPromise = this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
    await this.remoteDescriptionPromise;
    console.log('[WebRTC Forensic] REMOTE SDP (Answer):', this.peerConnection.remoteDescription?.sdp);
    await this.drainPendingCandidates(); // flush any queued ICE candidates
  }

  async addIceCandidate(candidate: any) {
    if (!this.peerConnection) return;
    
    if (this.remoteDescriptionPromise) {
      try {
        await this.remoteDescriptionPromise;
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Error adding ICE candidate after promise:', e);
      }
    } else {
      // Queue until setRemoteDescription is done — adding before it causes silent drops
      console.log('[WebRTC] Queuing ICE candidate (remote description not set yet)');
      this.pendingCandidates.push(candidate);
    }
  }

  private async drainPendingCandidates() {
    if (!this.peerConnection || this.pendingCandidates.length === 0) return;
    console.log(`[WebRTC] Draining ${this.pendingCandidates.length} queued ICE candidates`);
    const candidates = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Error draining ICE candidate:', e);
      }
    }
  }

  // ── SDP Munging for iOS Video Stability ────────────────────────────────────
  private enforceH264(sdp: string): string {
    // Prioritize H264 for iOS hardware compatibility (prevents black screen on iOS)
    if (!sdp) return sdp;
    const lines = sdp.split('\r\n');
    const mLineIndex = lines.findIndex(line => line.startsWith('m=video'));
    if (mLineIndex === -1) return sdp;

    const payloadTypes: string[] = [];
    const rtpMaps = lines.filter(line => line.startsWith('a=rtpmap:'));
    
    rtpMaps.forEach(line => {
      if (line.toLowerCase().includes('h264')) {
        const match = line.match(/a=rtpmap:(\d+)/);
        if (match) payloadTypes.push(match[1]);
      }
    });

    if (payloadTypes.length === 0) {
      console.log('[WebRTC] H264 payload type not found in SDP. Safely preserving original SDP.');
      return sdp;
    }

    const mLineParts = lines[mLineIndex].split(' ');
    // If the m=video line is malformed, don't touch it
    if (mLineParts.length < 4) return sdp;

    const originalPayloads = mLineParts.slice(3);
    const newPayloads = [
      ...payloadTypes,
      ...originalPayloads.filter(pt => !payloadTypes.includes(pt))
    ];
    lines[mLineIndex] = [...mLineParts.slice(0, 3), ...newPayloads].join(' ');
    
    console.log(`[WebRTC] Safely promoted H264 payloads: ${payloadTypes.join(', ')}`);
    return lines.join('\r\n');
  }

  private createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    // Reset ICE candidate state for fresh connection
    this.pendingCandidates = [];
    this.remoteDescriptionPromise = null;

    const config = {
      iceServers: this.iceServers,
      iceTransportPolicy: 'all', // Prioritizes direct P2P but will fallback to TURN automatically
    };

    console.log('[WebRTC] Creating PeerConnection with config:', JSON.stringify(config));
    this.peerConnection = new RTCPeerConnection(config);

    this.peerConnection.onconnectionstatechange = async () => {
      const state = this.peerConnection?.connectionState as WebRTCConnectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      const signalingState = this.peerConnection?.signalingState;
      console.log(`[WebRTC Forensic] Connection State Timeline -> Connection: ${state} | ICE: ${iceState} | Signaling: ${signalingState}`);

      if (state === 'connected' && this.peerConnection) {
        try {
          const stats = await this.peerConnection.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
              console.log('[WebRTC Forensic] Selected candidate pair:', report);
              const local = stats.get(report.localCandidateId);
              const remote = stats.get(report.remoteCandidateId);
              console.log('[WebRTC Forensic] Local candidate type:', local?.candidateType);
              console.log('[WebRTC Forensic] Remote candidate type:', remote?.candidateType);
            }
          });
        } catch (err) {
          console.warn('[WebRTC Forensic] Error getting stats', err);
        }
      }

      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(state, iceState);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState as WebRTCConnectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      const signalingState = this.peerConnection?.signalingState;
      console.log(`[WebRTC Forensic] Connection State Timeline -> Connection: ${state} | ICE: ${iceState} | Signaling: ${signalingState}`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(state, iceState);
      }
    };

    this.peerConnection.onsignalingstatechange = () => {
      const state = this.peerConnection?.connectionState as WebRTCConnectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      const signalingState = this.peerConnection?.signalingState;
      console.log(`[WebRTC Forensic] Connection State Timeline -> Connection: ${state} | ICE: ${iceState} | Signaling: ${signalingState}`);
    };

    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate) {
        console.log('[WebRTC Forensic] ICE Candidate:', event.candidate.candidate);
      }
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    // CRITICAL FIX: Replace deprecated onaddstream with modern ontrack.
    // We must collect incoming tracks and assemble a remote MediaStream manually.
    this.peerConnection.ontrack = (event: any) => {
      console.log('[WebRTC] ontrack fired — kind:', event.track?.kind, 'id:', event.track?.id);
      const track = event.track;
      if (!track) return;

      if (track.kind === 'audio') {
        this.remoteAudioTrack = track;
      } else if (track.kind === 'video') {
        this.remoteVideoTrack = track;
      }

      // 1. NEVER mutate and reuse the same MediaStream reference for UI state propagation.
      // 2. Maintain an internal track registry.
      // 3. When tracks change, create a NEW MediaStream instance.
      // @ts-ignore — react-native-webrtc provides MediaStream constructor
      const newStream = new MediaStream();
      
      if (this.remoteAudioTrack) newStream.addTrack(this.remoteAudioTrack);
      if (this.remoteVideoTrack) newStream.addTrack(this.remoteVideoTrack);

      this.remoteStream = newStream;

      // Notify the UI on every track addition so it can render the stream
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(this.remoteStream);
        console.log(`[WebRTC] Remote stream updated and dispatched to UI (Tracks: ${newStream.getTracks().length})`);
      }
    };
  }

  private async setupLocalStream(callType: 'audio' | 'video' = 'audio') {
    if (this.localStream) {
      this.localStream.release();
    }

    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: callType === 'video' ? {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      } : false,
    };

    try {
      // Add a 5 second timeout to getUserMedia. If the hardware is locked up from a previous call, 
      // this prevents the entire WebRTC pipeline from freezing indefinitely on "connecting..."
      const streamPromise = mediaDevices.getUserMedia(constraints) as unknown as Promise<MediaStream>;
      const timeoutPromise = new Promise<MediaStream>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout acquiring media devices (Hardware lock)')), 5000);
      });

      this.localStream = await Promise.race([streamPromise, timeoutPromise]);
      console.log('[WebRTC] Local media stream successfully captured');
    } catch (err) {
      console.error('[WebRTC] Failed to capture local media stream:', err);
      throw err;
    }
  }

  // ── Media Controls ─────────────────────────────────────────────────────────

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  muteLocalAudio(mute: boolean) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !mute;
    });
  }

  setEnableSpeakerphone(enabled: boolean) {
    console.log('[WebRTC] Speakerphone toggled to:', enabled);
    InCallManager.setForceSpeakerphoneOn(enabled);
  }

  switchCamera() {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(track => {
      // @ts-ignore - switchCamera is injected by react-native-webrtc video tracks
      if (typeof track._switchCamera === 'function') {
        // @ts-ignore
        track._switchCamera();
      }
    });
  }

  // ── Callbacks registration ─────────────────────────────────────────────────

  registerCallbacks(handlers: {
    onConnectionStateChange?: (state: WebRTCConnectionState, iceState?: string) => void;
    onRemoteStream?: (stream: MediaStream | null) => void;
    onIceCandidate?: (candidate: any) => void;
    onSignal?: (signal: any) => void;
  }) {
    if (handlers.onConnectionStateChange) this.onConnectionStateChangeCallback = handlers.onConnectionStateChange;
    if (handlers.onRemoteStream) this.onRemoteStreamCallback = handlers.onRemoteStream;
    if (handlers.onIceCandidate) this.onIceCandidateCallback = handlers.onIceCandidate;
    if (handlers.onSignal) this.onSignalCallback = handlers.onSignal;
  }

  // ── Clean up ───────────────────────────────────────────────────────────────

  async leaveChannel() {
    console.log('[WebRTC] Initiating comprehensive hardware and media resource cleanup');
    
    // Stop InCallManager to release iOS audio session correctly
    InCallManager.stop();
    
    // Stop all local media tracks to ensure immediate release of camera/microphone hardware
    if (this.localStream) {
      try {
        const streamToStop = this.localStream;
        this.localStream = null; // Clear immediately to prevent UI usage
        // Run track stop asynchronously. In some Android versions, synchronous stop() 
        // immediately followed by a new getUserMedia causes deadlocks.
        setTimeout(() => {
          try {
            streamToStop.getTracks().forEach(track => {
              track.enabled = false;
              track.stop();
              console.log(`[WebRTC] Hardware release: Stopped local track: ${track.kind}`);
            });
            streamToStop.release();
          } catch (e) {
            console.warn('[WebRTC] Async hardware release error:', e);
          }
        }, 150);
      } catch (err) {
        console.warn('[WebRTC] Error releasing local stream tracks:', err);
      }
    }

    // Stop and release remote stream tracks
    if (this.remoteStream) {
      try {
        this.remoteStream.getTracks().forEach(track => {
          track.enabled = false;
          track.stop();
        });
      } catch (err) {
        console.warn('[WebRTC] Error releasing remote stream tracks:', err);
      }
      this.remoteStream = null;
    }

    if (this.peerConnection) {
      try {
        // Discard listeners to avoid reference cycle leaks
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onicecandidate = null;
        this.peerConnection.onaddstream = null;
        this.peerConnection.ontrack = null;
        
        // Stop all senders to thoroughly clean up duplicate transceivers
        this.peerConnection.getSenders().forEach(sender => {
           if (sender.track) {
              sender.track.stop();
           }
        });
        
        this.peerConnection.close();
        console.log('[WebRTC] RTCPeerConnection closed cleanly.');
      } catch (err) {
        console.warn('[WebRTC] Error closing peer connection:', err);
      }
      this.peerConnection = null;
    }

    this.isInitialized = false;
    this.pendingCandidates = [];
    this.remoteDescriptionPromise = null;
    this.remoteAudioTrack = null;
    this.remoteVideoTrack = null;

    // Discard callback references to prevent garbage collector memory leaks
    if (this.onRemoteStreamCallback) {
      this.onRemoteStreamCallback(null);
    }
    this.onConnectionStateChangeCallback = null;
    this.onRemoteStreamCallback = null;
    this.onIceCandidateCallback = null;
    this.onSignalCallback = null;
  }

  destroy() {
    this.leaveChannel();
  }
}

export default new WebRTCService();
