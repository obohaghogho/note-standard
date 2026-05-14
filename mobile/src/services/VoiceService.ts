import { Audio } from 'expo-av';
import { MediaService } from './MediaService';

class VoiceService {
  private recording: Audio.Recording | null = null;

  async startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') throw new Error('Microphone permission denied');

      // Set audio mode for recording (this disables playback on iOS)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1, // DoNotMix
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;
      console.log('[VoiceService] Recording started');
    } catch (err) {
      // Ensure audio mode is reset even if recording fails to start
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
      console.error('[VoiceService] Failed to start recording', err);
      throw err;
    }
  }

  async stopRecording(conversationId: string) {
    if (!this.recording) return null;

    const recordingRef = this.recording;
    this.recording = null;

    try {
      await recordingRef.stopAndUnloadAsync();
      const uri = recordingRef.getURI();

      // CRITICAL: Reset audio mode so playback works again on iOS
      // Recording mode disables audio output on iOS until this is called
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1, // DoNotMix
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      if (!uri) {
        console.warn('[VoiceService] Recording URI is null after stopping');
        return null;
      }

      console.log('[VoiceService] Recording stopped, uploading:', uri);
      const fileName = `voice-note-${Date.now()}.m4a`;
      const attachment = await MediaService.uploadMedia(uri, fileName, 'audio/m4a', conversationId);
      console.log('[VoiceService] Upload complete:', attachment);
      return attachment;
    } catch (err) {
      // Always reset audio mode even on error
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
      console.error('[VoiceService] Failed to stop/upload recording', err);
      throw err;
    }
  }

  /**
   * Emergency cleanup — call if recording gets stuck
   */
  async cancelRecording() {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch (_) {}
      this.recording = null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    }).catch(() => {});
  }
}

export default new VoiceService();
