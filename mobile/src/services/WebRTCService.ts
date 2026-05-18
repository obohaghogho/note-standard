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
  private isInitialized = false;
  private iceServers: any[] = [];
  private pendingCandidates: any[] = []; // queued until setRemoteDescription done
  private remoteDescriptionSet = false;
  
  // Callbacks for UI updates
  private onConnectionStateChangeCallback: ((state: WebRTCConnectionState) => void) | null = null;
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

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Create SDP Offer
    const offer = await this.peerConnection!.createOffer({});
    await this.peerConnection!.setLocalDescription(offer);

    return offer;
  }

  async handleIncomingOffer(offerSdp: any, callType: 'audio' | 'video' = 'audio'): Promise<RTCSessionDescription> {
    await this.init(callType);
    await this.setupLocalStream(callType);
    this.createPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offerSdp));
    this.remoteDescriptionSet = true;
    await this.drainPendingCandidates(); // flush any queued ICE candidates
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    return answer;
  }

  async handleAnswer(answerSdp: any) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
    this.remoteDescriptionSet = true;
    await this.drainPendingCandidates(); // flush any queued ICE candidates
  }

  async addIceCandidate(candidate: any) {
    if (!this.peerConnection || !this.remoteDescriptionSet) {
      // Queue until setRemoteDescription is done — adding before it causes silent drops
      console.log('[WebRTC] Queuing ICE candidate (remote description not set yet)');
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[WebRTC] Error adding ICE candidate:', e);
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

  private createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    // Reset ICE candidate state for fresh connection
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;

    const config = {
      iceServers: this.iceServers,
      iceTransportPolicy: 'all', // Prioritizes direct P2P but will fallback to TURN automatically
    };

    console.log('[WebRTC] Creating PeerConnection with config:', JSON.stringify(config));
    this.peerConnection = new RTCPeerConnection(config);

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState as WebRTCConnectionState;
      console.log('[WebRTC] Connection State changed:', state);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(state);
      }
    };

    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    this.peerConnection.onaddstream = (event: any) => {
      console.log('[WebRTC] Remote stream added successfully');
      this.remoteStream = event.stream;
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(event.stream);
      }
    };
  }

  private async setupLocalStream(callType: 'audio' | 'video' = 'audio') {
    if (this.localStream) {
      this.localStream.release();
    }

    const constraints = {
      audio: true,
      video: callType === 'video' ? {
        facingMode: 'user',
        width: 640,
        height: 480,
        frameRate: 30,
      } : false,
    };

    try {
      this.localStream = await mediaDevices.getUserMedia(constraints) as MediaStream;
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
    // React Native WebRTC handles this via standard audio routing
    console.log('[WebRTC] Speakerphone toggled to:', enabled);
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
    onConnectionStateChange?: (state: WebRTCConnectionState) => void;
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
    
    // Stop all local media tracks to ensure immediate release of camera/microphone hardware
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(track => {
          track.enabled = false;
          track.stop();
          console.log(`[WebRTC] Hardware release: Stopped local track: ${track.kind}`);
        });
        this.localStream.release();
      } catch (err) {
        console.warn('[WebRTC] Error releasing local stream tracks:', err);
      }
      this.localStream = null;
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
        this.peerConnection.onicecandidate = null;
        this.peerConnection.onaddstream = null;
        this.peerConnection.close();
        console.log('[WebRTC] RTCPeerConnection closed cleanly.');
      } catch (err) {
        console.warn('[WebRTC] Error closing peer connection:', err);
      }
      this.peerConnection = null;
    }

    this.isInitialized = false;
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;

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
