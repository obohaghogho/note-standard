import { Audio } from 'expo-av';
import { MediaService } from './MediaService';

class VoiceService {
  private recording: Audio.Recording | null = null;

  async startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') throw new Error('Permission denied');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
      throw err;
    }
  }

  async stopRecording(conversationId: string) {
    if (!this.recording) return null;

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      if (!uri) return null;

      const fileName = `voice-note-${Date.now()}.m4a`;
      return await MediaService.uploadMedia(uri, fileName, 'audio/m4a', conversationId);
    } catch (err) {
      console.error('Failed to stop recording', err);
      throw err;
    }
  }
}

export default new VoiceService();
