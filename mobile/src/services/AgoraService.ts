/**
 * AgoraService – Native Agora RTC engine wrapper.
 * Handles audio/video channels for in-app VoIP.
 */
import createAgoraRtcEngine, {
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  IRtcEngineEventHandler,
  AudioProfileType,
  AudioScenarioType,
} from 'react-native-agora';
import { Platform, PermissionsAndroid } from 'react-native';
import apiClient from '../api/apiClient';

const AGORA_APP_ID = '652459c783604367857bc602fc8faae5';

class AgoraService {
  private engine: IRtcEngine | null = null;
  private isInitialized = false;
  private registeredHandlers: IRtcEngineEventHandler[] = [];

  // ── Initialization ────────────────────────────────────────────────────────

  async init(callType: 'audio' | 'video' = 'audio') {
    if (this.isInitialized) {
      if (callType === 'video') {
        this.engine?.enableVideo();
      }
      return;
    }

    if (Platform.OS === 'android') {
      const granted = await this.requestAndroidPermissions(callType);
      if (!granted) {
        throw new Error('Required permissions (Camera/Microphone) not granted');
      }
    }

    this.engine = createAgoraRtcEngine();
    this.engine.initialize({
      appId: AGORA_APP_ID,
      channelProfile: ChannelProfileType.ChannelProfileCommunication,
    });

    this.engine.setAudioProfile(
      AudioProfileType.AudioProfileSpeechStandard,
      AudioScenarioType.AudioScenarioChatroom
    );
    this.engine.enableAudio();

    if (callType === 'video') {
      this.engine.enableVideo();
    }

    this.isInitialized = true;
    console.log(`[AgoraService] Native engine initialized (${callType})`);
  }

  private async requestAndroidPermissions(callType: 'audio' | 'video' = 'audio'): Promise<boolean> {
    const permissions: any[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
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

  // ── Token ─────────────────────────────────────────────────────────────────

  private async fetchToken(channel: string): Promise<string> {
    try {
      const response = await apiClient.get(`/agora?channel=${channel}`);
      return response.data.token;
    } catch (err) {
      console.error('[AgoraService] Token fetch failed:', err);
      throw err;
    }
  }

  // ── Channel lifecycle ─────────────────────────────────────────────────────

  async joinChannel(channelId: string, uid: number = 0, callType: 'audio' | 'video' = 'audio') {
    if (!this.engine) await this.init(callType);

    // Ensure video is enabled for video calls even if init was called for audio
    if (callType === 'video') {
      this.engine?.enableVideo();
    }

    const token = await this.fetchToken(channelId);
    this.engine?.joinChannel(token, channelId, uid, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    });
    console.log(`[AgoraService] Joining channel: ${channelId} (${callType})`);
  }

  async leaveChannel() {
    if (!this.engine) return;
    try {
      this.engine.leaveChannel();
      console.log('[AgoraService] Left channel');
    } catch (err) {
      console.warn('[AgoraService] leaveChannel error:', err);
    }
  }

  // ── Audio controls ────────────────────────────────────────────────────────

  muteLocalAudio(mute: boolean) {
    this.engine?.muteLocalAudioStream(mute);
  }

  setEnableSpeakerphone(enabled: boolean) {
    this.engine?.setEnableSpeakerphone(enabled);
  }

  // ── Video controls ────────────────────────────────────────────────────────

  enableVideo() {
    this.engine?.enableVideo();
  }

  disableVideo() {
    this.engine?.disableVideo();
  }

  muteLocalVideo(mute: boolean) {
    this.engine?.muteLocalVideoStream(mute);
  }

  switchCamera() {
    this.engine?.switchCamera();
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  registerEventHandler(handler: IRtcEngineEventHandler) {
    this.engine?.registerEventHandler(handler);
    this.registeredHandlers.push(handler);
  }

  unregisterEventHandler(handler: IRtcEngineEventHandler) {
    this.engine?.unregisterEventHandler(handler);
    this.registeredHandlers = this.registeredHandlers.filter(h => h !== handler);
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  destroy() {
    // Unregister all handlers first
    this.registeredHandlers.forEach(h => {
      try { this.engine?.unregisterEventHandler(h); } catch (_) {}
    });
    this.registeredHandlers = [];
    this.engine?.release();
    this.engine = null;
    this.isInitialized = false;
    console.log('[AgoraService] Engine destroyed');
  }
}

export default new AgoraService();
