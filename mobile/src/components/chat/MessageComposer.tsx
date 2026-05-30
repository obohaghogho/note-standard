import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaService } from '../../services/MediaService';
import VoiceService from '../../services/VoiceService';
import { Alert } from 'react-native';

interface Props {
  conversationId: string;
  onSend: (text: string, attachmentId?: string) => Promise<void>;
  insets: { bottom: number };
}

export const MessageComposer = React.memo(({ conversationId, onSend, insets }: Props) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const handlePickMedia = async () => {
    try {
      const asset = await MediaService.pickImage();
      if (!asset) return;

      setSending(true);
      const attachment = await MediaService.uploadMedia(
        asset.uri,
        asset.fileName || `upload_${Date.now()}.jpg`,
        asset.mimeType || 'image/jpeg',
        conversationId
      );

      const contentLabel = (asset.mimeType || '').startsWith('video') ? '📹 Video' : '🖼️ Image';
      await onSend(contentLabel, attachment.id);
    } catch (err: any) {
      console.error('[MessageComposer] Media upload error:', err);
      Alert.alert('Upload Error', err.message || 'Failed to upload media. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleVoiceNote = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        setSending(true);
        const attachment = await VoiceService.stopRecording(conversationId);
        if (attachment) {
          await onSend('🎤 Voice Note', attachment.id);
        } else {
          Alert.alert('Voice Note Error', 'Recording was empty. Please try again.');
        }
      } catch (err: any) {
        console.error('[MessageComposer] Voice note stop error:', err);
        Alert.alert('Voice Note Error', err.message || 'Failed to process voice note.');
      } finally {
        setSending(false);
      }
    } else {
      try {
        await VoiceService.startRecording();
        setIsRecording(true);
      } catch (err: any) {
        console.error('[MessageComposer] Voice note start error:', err);
        setIsRecording(false);
        Alert.alert('Recording Error', err.message || 'Could not start recording. Check microphone permission.');
      }
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    
    setText('');
    setSending(true);
    try {
      await onSend(trimmed);
    } catch (e) {
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia} disabled={sending}>
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#444"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
          textAlignVertical="center"
        />

        {text.trim() ? (
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={sending || !text.trim()}
          >
            <LinearGradient
              colors={sending ? ['#333', '#222'] : ['#6366f1', '#4f46e5']}
              style={styles.sendGrad}
            >
              <Text style={styles.sendIcon}>{sending ? '…' : '➤'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.micBtn} onPress={handleVoiceNote} disabled={sending}>
            <LinearGradient 
              colors={isRecording ? ['#ef4444', '#dc2626'] : ['#6366f1', '#4f46e5']} 
              style={styles.sendGrad}
            >
              <Text style={styles.sendIcon}>{isRecording ? '⏹' : '🎤'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  inputContainer: { backgroundColor: '#0d0d1e', borderTopWidth: 1, borderColor: '#111133' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#111133',
    backgroundColor: '#060611',
    gap: 8,
  },
  attachBtn: { width: 44, height: 48, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 24, color: '#6366f1' },
  input: {
    flex: 1,
    backgroundColor: '#0d0d1e',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#111133',
    maxHeight: 120,
    minHeight: 48,
  },
  micBtn: { borderRadius: 24, overflow: 'hidden' },
  sendBtn: { borderRadius: 24, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.5 },
  sendGrad: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
  sendIcon: { color: '#fff', fontSize: 18 },
});
