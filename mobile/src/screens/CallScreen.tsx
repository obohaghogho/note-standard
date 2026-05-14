import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
} from 'react-native';
import { RtcSurfaceView, RenderModeType } from 'react-native-agora';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import AgoraService from '../services/AgoraService';
import SignalingService from '../services/SignalingService';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'Call'>;
  route: RouteProp<ChatStackParamList, 'Call'>;
};

const { width, height } = Dimensions.get('window');

export default function CallScreen({ navigation, route }: Props) {
  const { type, conversationId, targetUserId, targetName, isIncoming } = route.params;
  const [joined, setJoined] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(type === 'video');

  useEffect(() => {
    const setup = async () => {
      try {
        await AgoraService.init();
        
        AgoraService.registerEventHandler({
          onJoinChannelSuccess: (connection, elapsed) => {
            console.log('[CallScreen] Joined channel:', connection.channelId);
            setJoined(true);
          },
          onUserJoined: (connection, remoteUid, elapsed) => {
            console.log('[CallScreen] Remote user joined:', remoteUid);
            setRemoteUid(remoteUid);
          },
          onUserOffline: (connection, remoteUid, reason) => {
            console.log('[CallScreen] Remote user offline:', remoteUid);
            setRemoteUid(null);
            endCall();
          },
          onError: (err) => {
            console.error('[CallScreen] Agora Error:', err);
          }
        });

        if (isIncoming) {
          // Join immediately since it was answered
          await SignalingService.answerCall(targetUserId, '', conversationId);
        } else {
          // Initiating call
          await SignalingService.startCall(targetUserId, targetName, type, conversationId);
        }
      } catch (err) {
        console.error('[CallScreen] Setup error:', err);
        navigation.goBack();
      }
    };

    setup();

    return () => {
      AgoraService.leaveChannel();
      SignalingService.cancelActiveCall();
    };
  }, []);

  const endCall = () => {
    SignalingService.cancelActiveCall();
    navigation.goBack();
  };

  const toggleMute = () => {
    AgoraService.muteLocalAudio(!isMuted);
    setIsMuted(!isMuted);
  };

  const toggleSpeaker = () => {
    AgoraService.setEnableSpeakerphone(!isSpeaker);
    setIsSpeaker(!isSpeaker);
  };

  return (
    <View style={styles.container}>
      {type === 'video' ? (
        <View style={styles.videoContainer}>
          {remoteUid ? (
            <RtcSurfaceView
              canvas={{ uid: remoteUid }}
              style={styles.remoteVideo}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.statusText}>{joined ? 'Ringing...' : 'Connecting...'}</Text>
            </View>
          )}
          
          <RtcSurfaceView
            canvas={{ uid: 0 }} // Local user
            style={styles.localVideo}
          />
        </View>
      ) : (
        <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.audioContainer}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{targetName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.nameText}>{targetName}</Text>
          <Text style={styles.statusText}>
            {!joined ? 'Initializing...' : (remoteUid ? '00:01' : 'Ringing...')}
          </Text>
        </LinearGradient>
      )}

      <View style={styles.controls}>
        <TouchableOpacity onPress={toggleMute} style={[styles.controlBtn, isMuted && styles.btnActive]}>
          <Text style={styles.controlIcon}>{isMuted ? '🎙️' : '🎤'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={endCall} style={styles.endBtn}>
          <Text style={styles.controlIcon}>📞</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleSpeaker} style={[styles.controlBtn, isSpeaker && styles.btnActive]}>
          <Text style={styles.controlIcon}>{isSpeaker ? '🔊' : '🔈'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoContainer: { flex: 1 },
  remoteVideo: { flex: 1 },
  localVideo: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  audioContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarText: { color: '#fff', fontSize: 48, fontWeight: 'bold' },
  nameText: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  statusText: { color: '#94a3b8', fontSize: 16 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  controls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnActive: { backgroundColor: '#4f46e5' },
  endBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '135deg' }],
  },
  controlIcon: { fontSize: 24 },
});
