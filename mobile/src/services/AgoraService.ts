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

  async init() {
    if (this.isInitialized) return;

    if (Platform.OS === 'android') {
      await this.requestAndroidPermissions();
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

    this.isInitialized = true;
    console.log('[AgoraService] Native engine initialized');
  }

  private async requestAndroidPermissions() {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.CAMERA,
    ]);
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

  async joinChannel(channelId: string, uid: number = 0) {
    if (!this.engine) await this.init();
    const token = await this.fetchToken(channelId);
    this.engine?.joinChannel(token, channelId, uid, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    });
    console.log(`[AgoraService] Joining channel: ${channelId}`);
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
