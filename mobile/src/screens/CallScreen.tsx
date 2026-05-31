/**
 * CallScreen – In-app WebRTC Video/Audio VoIP call screen.
 *
 * ❌ Zero Agora code, Zero carrier GSM redirects, Zero SIM calls.
 * ✅ Pure WebRTC rendering utilizing react-native-webrtc.
 * ✅ Seamless peer connections and layout scaling.
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
import { RTCView, MediaStream } from 'react-native-webrtc';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import WebRTCService, { WebRTCConnectionState } from '../services/WebRTCService';
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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(type === 'video');
  const [isMinimized, setIsMinimized] = useState(false);

  // Call duration timer
  const [durationSecs, setDurationSecs] = useState(0);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── Setup on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    StatusBar.setHidden(false);
    let isMounted = true;

    const setup = async () => {
      try {
        // BUG FIX (Bugs 1 & 7): Register callbacks FIRST — before WebRTCService.init().
        // If the remote peer is fast (e.g. SDP exchange completes before CallScreen fully
        // mounts), onconnectionstatechange may fire while the callback is still null.
        // Registering here guarantees the callback is in place before any async signaling.
        WebRTCService.registerCallbacks({
          onConnectionStateChange: (state: WebRTCConnectionState, iceState?: string) => {
            if (!isMounted) return;
            console.log(`[CallScreen] Connection state: ${state} | ICE: ${iceState}`);
            if (state === 'connected') {
              setCallState('connected');
              CallService.onCallConnected();
              startDurationTimer();
              // Refresh streams — tracks may have arrived before this callback was set
              setLocalStream(WebRTCService.getLocalStream());
              setRemoteStream(WebRTCService.getRemoteStream());
            } else if (state === 'failed') {
              setCallState('failed');
              WebRTCService.leaveChannel();
              CallService.handleCallEnded('error');
              setTimeout(() => { if (isMounted) navigation.goBack(); }, 1500);
            } else if (state === 'disconnected') {
              setCallState('reconnecting');
            } else if (state === 'closed') {
              setCallState('ended');
            }
          },
          onRemoteStream: (stream: MediaStream | null) => {
            if (isMounted) setRemoteStream(stream);
          },
        });

        await WebRTCService.init(type);

        if (isIncoming) {
          // Ensure CallService is in ringing state (may have been set by push notification path)
          if (CallService.getState() === 'idle') {
            console.warn('[CallScreen] CallService was idle for incoming call — forcing ringing state');
            await CallService.displayIncomingCall({
              callerId: SignalingService.activeTargetId || '',
              callerName: route.params.targetName,
              callType: type,
              conversationId: route.params.conversationId,
            });
          }
          // Note: SignalingService.answerCall() was already called by the modal/push handler
          // before navigating here. Do NOT call it again — double answering resets the PC.
          setCallState('connecting');
        } else {
          setCallState('calling');
        }
      } catch (err) {
        console.error('[CallScreen] WebRTC setup failure:', err);
        if (isMounted) {
          setCallState('failed');
          setTimeout(() => navigation.goBack(), 2000);
        }
      }
    };

    setup();

    const unsubEnded = CallService.onCallEnded(() => {
      if (isMounted) {
        stopDurationTimer();
        setTimeout(() => navigation.goBack(), 800);
      }
    });

    const unsubState = CallService.onStateChange(({ state }: { state: CallState }) => {
      if (!isMounted) return;
      setCallState(state);
      if (state === 'connected') {
        startDurationTimer();
        // BUG FIX: Re-fetch streams in case they were set before this callback fired
        setLocalStream(WebRTCService.getLocalStream());
        setRemoteStream(WebRTCService.getRemoteStream());
      }
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
      WebRTCService.leaveChannel();
    };
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────

  const handleEndCall = useCallback(async (emit = true) => {
    stopDurationTimer();
    if (emit) {
      await SignalingService.endActiveCall();
    } else {
      await WebRTCService.leaveChannel();
      await CallService.handleCallEnded('normal');
    }
    navigation.goBack();
  }, [navigation, stopDurationTimer]);

  const toggleMute = useCallback(() => {
    WebRTCService.muteLocalAudio(!isMuted);
    setIsMuted(m => !m);
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    WebRTCService.setEnableSpeakerphone(!isSpeaker);
    setIsSpeaker(s => !s);
  }, [isSpeaker]);

  const toggleCamera = useCallback(() => {
    WebRTCService.switchCamera();
  }, []);

  // ── Status label ───────────────────────────────────────────────────────

  const statusLabel = () => {
    switch (callState) {
      case 'calling':      return 'Calling...';
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
          {/* Remote video fullscreen */}
          {remoteStream && remoteStream.getVideoTracks().length > 0 ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
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
          {!isMinimized && localStream && localStream.getVideoTracks().length > 0 && (
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
            />
          )}

          {/* Camera Flip */}
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
