/**
 * CallScreen – In-app VoIP call screen.
 *
 * ❌ Does NOT trigger GSM/carrier/telecom dialer
 * ✅ Uses Agora RTC for audio/video streams
 * ✅ Full state machine integration via CallService
 * ✅ Proper cleanup on unmount
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { RtcSurfaceView } from 'react-native-agora';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import AgoraService from '../services/AgoraService';
import SignalingService from '../services/SignalingService';
import CallService, { CallState } from '../services/CallService';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'Call'>;
  route: RouteProp<ChatStackParamList, 'Call'>;
};

const { width } = Dimensions.get('window');

export default function CallScreen({ navigation, route }: Props) {
  const { type, conversationId, targetUserId, targetName, isIncoming } = route.params;

  const [callState, setCallState] = useState<CallState>(isIncoming ? 'connecting' : 'calling');
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(type === 'video');
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  // Call duration timer
  const [durationSecs, setDurationSecs] = useState(0);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Agora event handler ref for cleanup
  const agoraHandlerRef = useRef<any>(null);

  // ── Duration timer ─────────────────────────────────────────────────────

  const startDurationTimer = useCallback(() => {
    if (durationTimer.current) return;
    durationTimer.current = setInterval(() => {
      setDurationSecs(s => s + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimer.current) {
      clearInterval(durationTimer.current);
      durationTimer.current = null;
    }
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Agora event handler ────────────────────────────────────────────────

  const setupAgoraEvents = useCallback(() => {
    const handler = {
      onJoinChannelSuccess: () => {
        console.log('[CallScreen] Joined Agora channel');
        setCallState('connected');
        CallService.onCallConnected();
        startDurationTimer();
      },
      onUserJoined: (_: any, uid: number) => {
        console.log('[CallScreen] Remote user joined:', uid);
        setRemoteUid(uid);
      },
      onUserOffline: (_: any, uid: number) => {
        console.log('[CallScreen] Remote user went offline:', uid);
        setRemoteUid(null);
        handleEndCall();
      },
      onError: (err: any) => {
        console.error('[CallScreen] Agora error:', err);
        setCallState('failed');
      },
      onConnectionStateChanged: (_: any, state: number) => {
        // 4 = Reconnecting, 5 = Failed
        if (state === 4) setCallState('reconnecting');
        if (state === 5) setCallState('failed');
        if (state === 3) { // Connected
          setCallState('connected');
          startDurationTimer();
        }
      },
    };
    agoraHandlerRef.current = handler;
    AgoraService.registerEventHandler(handler);
  }, [startDurationTimer]);

  // ── Setup on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    StatusBar.setHidden(false);
    let isMounted = true;

    const setup = async () => {
      try {
        await AgoraService.init();
        setupAgoraEvents();

        if (isIncoming) {
          // Already answered via IncomingCallModal — just join channel
          await AgoraService.joinChannel(conversationId);
        } else {
          // Outgoing — SignalingService already joined but let's ensure
          setCallState('calling');
        }
      } catch (err) {
        console.error('[CallScreen] Setup error:', err);
        if (isMounted) {
          setCallState('failed');
          setTimeout(() => navigation.goBack(), 2000);
        }
      }
    };

    setup();

    // Listen for call ended externally (remote hang up, timeout)
    const unsubEnded = CallService.onCallEnded(() => {
      if (isMounted) handleEndCall(false);
    });

    const unsubState = CallService.onStateChange(({ state }: { state: CallState }) => {
      if (!isMounted) return;
      setCallState(state);
      if (state === 'connected') startDurationTimer();
      if (state === 'ended' || state === 'failed') {
        stopDurationTimer();
        setTimeout(() => navigation.goBack(), 1000);
      }
    });

    return () => {
      isMounted = false;
      unsubEnded();
      unsubState();
      stopDurationTimer();
      if (agoraHandlerRef.current) {
        AgoraService.unregisterEventHandler(agoraHandlerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────

  const handleEndCall = useCallback(async (emit = true) => {
    stopDurationTimer();
    if (emit) {
      await SignalingService.endActiveCall();
    } else {
      await AgoraService.leaveChannel();
      await CallService.handleCallEnded('normal');
    }
    navigation.goBack();
  }, [navigation, stopDurationTimer]);

  const toggleMute = useCallback(() => {
    AgoraService.muteLocalAudio(!isMuted);
    setIsMuted(m => !m);
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    AgoraService.setEnableSpeakerphone(!isSpeaker);
    setIsSpeaker(s => !s);
  }, [isSpeaker]);

  const toggleCamera = useCallback(() => {
    AgoraService.switchCamera();
    setIsFrontCamera(f => !f);
  }, []);

  // ── Status label ───────────────────────────────────────────────────────

  const statusLabel = () => {
    switch (callState) {
      case 'calling':      return 'Ringing...';
      case 'ringing':      return 'Ringing...';
      case 'connecting':   return 'Connecting...';
      case 'connected':    return formatDuration(durationSecs);
      case 'reconnecting': return '⚠️ Reconnecting...';
      case 'ended':        return 'Call ended';
      case 'failed':       return '❌ Call failed';
      default:             return '';
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {type === 'video' ? (
        // ── Video call layout ─────────────────────────────────────────────
        <View style={styles.videoContainer}>
          {/* Remote video full screen */}
          {remoteUid ? (
            <RtcSurfaceView
              canvas={{ uid: remoteUid }}
              style={styles.remoteVideo}
            />
          ) : (
            <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.remoteVideo}>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarText}>{targetName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.nameText}>{targetName}</Text>
              <Text style={styles.statusText}>{statusLabel()}</Text>
            </LinearGradient>
          )}

          {/* Local video PiP */}
          {!isMinimized && (
            <RtcSurfaceView
              canvas={{ uid: 0 }}
              style={styles.localVideo}
            />
          )}

          {/* Camera switch */}
          {type === 'video' && (
            <TouchableOpacity style={styles.switchCameraBtn} onPress={toggleCamera}>
              <Text style={styles.switchCameraIcon}>🔄</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // ── Audio call layout ─────────────────────────────────────────────
        <LinearGradient colors={['#0f172a', '#1e1b4b']} style={styles.audioContainer}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{targetName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.nameText}>{targetName}</Text>
          <Text style={styles.statusText}>{statusLabel()}</Text>
        </LinearGradient>
      )}

      {/* ── Floating controls ── */}
      <View style={styles.controls}>
        {/* Mute */}
        <View style={styles.ctrlWrap}>
          <TouchableOpacity
            onPress={toggleMute}
            style={[styles.controlBtn, isMuted && styles.btnActive]}
          >
            <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
          </TouchableOpacity>
          <Text style={styles.ctrlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </View>

        {/* End call */}
        <View style={styles.ctrlWrap}>
          <TouchableOpacity onPress={() => handleEndCall(true)} style={styles.endBtn}>
            <Text style={styles.controlIcon}>📵</Text>
          </TouchableOpacity>
          <Text style={styles.ctrlLabel}>End</Text>
        </View>

        {/* Speaker / Camera toggle */}
        {type === 'video' ? (
          <View style={styles.ctrlWrap}>
            <TouchableOpacity onPress={toggleCamera} style={styles.controlBtn}>
              <Text style={styles.controlIcon}>🔄</Text>
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Flip</Text>
          </View>
        ) : (
          <View style={styles.ctrlWrap}>
            <TouchableOpacity
              onPress={toggleSpeaker}
              style={[styles.controlBtn, isSpeaker && styles.btnActive]}
            >
              <Text style={styles.controlIcon}>{isSpeaker ? '🔊' : '🔈'}</Text>
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>{isSpeaker ? 'Earpiece' : 'Speaker'}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
  },
  remoteVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  localVideo: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 110,
    height: 165,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  audioContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  nameText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
  },
  switchCameraBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchCameraIcon: {
    fontSize: 22,
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 28,
    paddingHorizontal: 20,
  },
  ctrlWrap: {
    alignItems: 'center',
    gap: 6,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: '#4f46e5',
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 10,
  },
  controlIcon: {
    fontSize: 26,
    color: '#fff',
  },
  ctrlLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
});
