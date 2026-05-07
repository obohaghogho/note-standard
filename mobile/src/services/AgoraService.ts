import createAgoraRtcEngine, {
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcConnection,
  IRtcEngineEventHandler,
} from 'react-native-agora';
import { Platform, PermissionsAndroid } from 'react-native';
import axios from 'axios';

const AGORA_APP_ID = "652459c783604367857bc602fc8faae5";
const API_URL = 'https://note-standard-api.onrender.com';

class AgoraService {
  private engine: IRtcEngine | null = null;
  private isInitialized = false;

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

    this.isInitialized = true;
    console.log('[AgoraService] Native Engine Initialized');
  }

  private async requestAndroidPermissions() {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.CAMERA,
    ]);
  }

  async fetchToken(channel: string) {
    try {
      const response = await axios.get(`${API_URL}/api/agora?channel=${channel}`);
      return response.data.token;
    } catch (err) {
      console.error('[AgoraService] Token fetch failed:', err);
      throw err;
    }
  }

  async joinChannel(channelId: string, uid: number = 0) {
    if (!this.engine) await this.init();

    const token = await this.fetchToken(channelId);
    
    this.engine?.joinChannel(token, channelId, uid, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    });
  }

  async leaveChannel() {
    this.engine?.leaveChannel();
  }

  registerEventHandler(handler: IRtcEngineEventHandler) {
    this.engine?.registerEventHandler(handler);
  }

  unregisterEventHandler(handler: IRtcEngineEventHandler) {
    this.engine?.unregisterEventHandler(handler);
  }

  destroy() {
    this.engine?.release();
    this.engine = null;
    this.isInitialized = false;
  }
}

export default new AgoraService();
