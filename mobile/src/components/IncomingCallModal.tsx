import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CallService from '../services/CallService';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../navigation/ChatStack';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');

import { navigate } from '../navigation/AppNavigator';

export default function IncomingCallModal() {
  const [visible, setVisible] = useState(false);
  const [callData, setCallData] = useState<any>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    // 1. Listen for "Show UI" event (Android Self-Managed)
    CallService.onShowIncomingCallUI((data) => {
      console.log('[IncomingCallModal] Show UI requested:', data);
      setCallData(data);
      setVisible(true);
      playRingtone();
    });

    // 2. Listen for external rejections (caller hung up)
    CallService.onReject(() => {
      console.log('[IncomingCallModal] Call rejected/ended externally');
      close();
    });

    return () => {
      stopRingtone();
    };
  }, []);

  const playRingtone = async () => {
    try {
      // Use a standard expo-av sound loading with try-catch
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/ringtone.mp3'),
        { isLooping: true, volume: 1.0 }
      );
      setSound(sound);
      await sound.playAsync();
    } catch (err) {
      console.warn('[IncomingCallModal] Ringtone failed (missing file), using silence.');
    }
  };

  const stopRingtone = async () => {
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (e) {}
      setSound(null);
    }
  };

  const handleAnswer = () => {
    stopRingtone();
    setVisible(false);
    CallService.answerCall();
    
    // Navigate to CallScreen
    if (callData) {
      navigate('Call', {
        type: callData.hasVideo ? 'video' : 'audio',
        conversationId: callData.conversationId || '',
        targetUserId: callData.handle || '',
        targetName: callData.handle || 'User',
        isIncoming: true
      });
    }
  };

  const handleReject = () => {
    stopRingtone();
    setVisible(false);
    CallService.rejectCall();
  };

  const close = () => {
    stopRingtone();
    setVisible(false);
    setCallData(null);
  };

  if (!visible || !callData) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.container}>
        <View style={styles.content}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{(callData.handle || 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.nameText}>{callData.handle || 'Incoming Call'}</Text>
          <Text style={styles.statusText}>NoteStandard {callData.hasVideo ? 'Video' : 'Audio'} Call...</Text>

          <View style={styles.controls}>
            <TouchableOpacity onPress={handleReject} style={styles.rejectBtn}>
              <Text style={styles.icon}>📞</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleAnswer} style={styles.answerBtn}>
              <Text style={styles.icon}>📞</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  avatarLarge: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  avatarText: { color: '#fff', fontSize: 56, fontWeight: 'bold' },
  nameText: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  statusText: { color: '#94a3b8', fontSize: 18, marginBottom: 80 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 40,
  },
  answerBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  rejectBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    transform: [{ rotate: '135deg' }],
  },
  icon: { fontSize: 32, color: '#fff' },
});
