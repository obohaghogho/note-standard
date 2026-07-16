/**
 * AgoraService — DEPRECATED
 * Agora has been entirely removed in favor of pure WebRTC.
 * Use WebRTCService instead.
 */
class AgoraService {
  init() {
    console.warn('AgoraService is deprecated and removed from this application. Use WebRTCService.');
  }
  joinChannel() {
    console.warn('AgoraService is deprecated and removed from this application. Use WebRTCService.');
  }
  leaveChannel() {
    console.warn('AgoraService is deprecated and removed from this application. Use WebRTCService.');
  }
}

export default new AgoraService();
