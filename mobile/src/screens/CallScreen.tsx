/**
 * CallScreen – Native WebRTC Audio/Video Call Screen.
 *
 * This screen is navigated to AFTER the call has been initiated/answered
 * through SignalingService. Media and PeerConnection are already set up.
 * This screen only renders state and provides controls.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated,
  Easing,
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

const { width, height } = Dimensions.get('window');

const GRADIENT_COLORS: Record<string, [string, string, string]> = {
  default: ['#0f0c29', '#302b63', '#24243e'],
  video:   ['#0d0d2b', '#1a0533', '#0a0a1a'],
  audio:   ['#0f2027', '#203a43', '#2c5364'],
};

export default function CallScreen({ navigation, route }: Props) {
  const { type, conversationId, targetUserId, targetName, isIncoming } = route.params;

  const [callState, setCallState]       = useState<CallState>(isIncoming ? 'connecting' : 'calling');
  const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted]           = useState(false);
  const [isSpeaker, setIsSpeaker]       = useState(type === 'video');
  const [durationSecs, setDuration]     = useState(0);

  const durationRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const isMounted    = useRef(true);

  // ── Pulsing animation for avatar ring ─────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const startTimer = useCallback(() => {
    if (durationRef.current) return;
    durationRef.current = setInterval(() => {
      if (isMounted.current) setDuration(s => s + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Mount setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    StatusBar.setHidden(false);
    isMounted.current = true;

    // Register stream + connection callbacks on mount.
    // NOTE: Do NOT call WebRTCService.acquireMedia() or prepareForIncomingCall() here.
    // Those are already done in SignalingService.startCall() / answerCall().
    WebRTCService.registerCallbacks({
      onConnectionStateChange: (state: WebRTCConnectionState) => {
        if (!isMounted.current) return;
        console.log('[CallScreen] Connection state:', state);
        if (state === 'connected') {
          setCallState('connected');
          CallService.onCallConnected();
          startTimer();
          setLocalStream(WebRTCService.getLocalStream());
          setRemoteStream(WebRTCService.getRemoteStream());
        } else if (state === 'failed') {
          setCallState('failed');
          SignalingService.endActiveCall();
          setTimeout(() => { if (isMounted.current) navigation.goBack(); }, 1500);
        } else if (state === 'disconnected') {
          setCallState('reconnecting');
        }
      },
      onRemoteStream: (stream: MediaStream | null) => {
        if (isMounted.current) setRemoteStream(stream);
      },
    });

    // Populate streams from service in case they were set before this screen mounted
    const ls = WebRTCService.getLocalStream();
    const rs = WebRTCService.getRemoteStream();
    if (ls) setLocalStream(ls);
    if (rs) setRemoteStream(rs);

    const unsubEnded = CallService.onCallEnded(() => {
      if (!isMounted.current) return;
      stopTimer();
      setTimeout(() => navigation.goBack(), 800);
    });

    const unsubState = CallService.onStateChange(({ state }: { state: CallState }) => {
      if (!isMounted.current) return;
      setCallState(state);
      if (state === 'connected') {
        startTimer();
        setLocalStream(WebRTCService.getLocalStream());
        setRemoteStream(WebRTCService.getRemoteStream());
      }
      if (state === 'ended' || state === 'failed') {
        stopTimer();
        setTimeout(() => navigation.goBack(), 1000);
      }
    });

    return () => {
      isMounted.current = false;
      unsubEnded();
      unsubState();
      stopTimer();
    };
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    stopTimer();
    await SignalingService.endActiveCall();
    navigation.goBack();
  }, [navigation, stopTimer]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    WebRTCService.muteLocalAudio(next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeaker;
    WebRTCService.setEnableSpeakerphone(next);
    setIsSpeaker(next);
  }, [isSpeaker]);

  const flipCamera = useCallback(() => { WebRTCService.switchCamera(); }, []);

  const statusLabel = () => {
    switch (callState) {
      case 'calling':      return 'Calling...';
      case 'ringing':      return 'Ringing...';
      case 'connecting':   return 'Connecting...';
      case 'connected':    return fmt(durationSecs);
      case 'reconnecting': return 'Reconnecting...';
      case 'ended':        return 'Call ended';
      case 'failed':       return 'Call failed';
      default:             return '';
    }
  };

  const isConnected   = callState === 'connected';
  const gradientKey   = type === 'video' ? 'video' : 'audio';
  const hasRemoteVideo = !!remoteStream && remoteStream.getVideoTracks().length > 0;
  const hasLocalVideo  = !!localStream  && localStream.getVideoTracks().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {type === 'video' ? (
        // ── Video call ──────────────────────────────────────────────────────
        <View style={styles.fill}>
          {/* Remote video fullscreen */}
          {hasRemoteVideo ? (
            <RTCView streamURL={remoteStream!.toURL()} style={styles.remoteVideo} objectFit="cover" />
          ) : (
            <LinearGradient colors={GRADIENT_COLORS.video} style={styles.remoteVideo}>
              <Animated.View style={[styles.avatarRing, { transform: [{ scale: pulseAnim }] }]} />
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>{targetName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{targetName}</Text>
              <Text style={styles.status}>{statusLabel()}</Text>
            </LinearGradient>
          )}

          {/* Local video PiP */}
          {hasLocalVideo && (
            <View style={styles.pip}>
              <RTCView streamURL={localStream!.toURL()} style={styles.fill} objectFit="cover" />
            </View>
          )}

          {/* Flip camera */}
          <TouchableOpacity style={styles.flipBtn} onPress={flipCamera}>
            <Text style={styles.controlIcon}>🔄</Text>
          </TouchableOpacity>

          {/* Status when connected */}
          {isConnected && hasRemoteVideo && (
            <View style={styles.topBar}>
              <Text style={styles.timerText}>{fmt(durationSecs)}</Text>
            </View>
          )}
        </View>
      ) : (
        // ── Audio call ──────────────────────────────────────────────────────
        <LinearGradient colors={GRADIENT_COLORS.audio} style={styles.fill}>
          <View style={styles.audioContent}>
            <Animated.View style={[styles.avatarRing, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{targetName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name}>{targetName}</Text>
            <Text style={[
              styles.status,
              callState === 'connected'    && styles.statusConnected,
              callState === 'reconnecting' && styles.statusWarning,
            ]}>
              {statusLabel()}
            </Text>
          </View>
        </LinearGradient>
      )}

      {/* ── Bottom controls ────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Mute */}
        <View style={styles.ctrlItem}>
          <TouchableOpacity style={[styles.ctrlBtn, isMuted && styles.ctrlBtnActive]} onPress={toggleMute}>
            <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
          </TouchableOpacity>
          <Text style={styles.ctrlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </View>

        {/* End call */}
        <View style={styles.ctrlItem}>
          <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
            <Text style={[styles.controlIcon, { fontSize: 30 }]}>📵</Text>
          </TouchableOpacity>
          <Text style={styles.ctrlLabel}>End</Text>
        </View>

        {/* Speaker / flip camera */}
        {type === 'video' ? (
          <View style={styles.ctrlItem}>
            <TouchableOpacity style={styles.ctrlBtn} onPress={flipCamera}>
              <Text style={styles.controlIcon}>🔄</Text>
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Flip</Text>
          </View>
        ) : (
          <View style={styles.ctrlItem}>
            <TouchableOpacity style={[styles.ctrlBtn, isSpeaker && styles.ctrlBtnActive]} onPress={toggleSpeaker}>
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
  container:        { flex: 1, backgroundColor: '#000' },
  fill:             { flex: 1 },
  remoteVideo:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioContent:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarRing: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 2, borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(139,92,246,0.1)',
  },
  avatarCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#4f46e5',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6, shadowRadius: 16, elevation: 12,
  },
  avatarLetter: { color: '#fff', fontSize: 48, fontWeight: 'bold' },
  name:         { color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  status:       { color: '#94a3b8', fontSize: 16, textAlign: 'center' },
  statusConnected: { color: '#34d399' },
  statusWarning:   { color: '#fbbf24' },
  pip: {
    position: 'absolute', top: 56, right: 16,
    width: 110, height: 165, borderRadius: 14,
    overflow: 'hidden', backgroundColor: '#111',
    borderWidth: 2, borderColor: 'rgba(139,92,246,0.6)',
  },
  topBar: {
    position: 'absolute', top: 20, left: 0, right: 0,
    alignItems: 'center',
  },
  timerText: { color: '#34d399', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  flipBtn: {
    position: 'absolute', top: 16, left: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  controls: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 28,
    paddingHorizontal: 24,
  },
  ctrlItem:  { alignItems: 'center', gap: 8 },
  ctrlBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  ctrlBtnActive: { backgroundColor: '#4f46e5' },
  endBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#ef4444',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7, shadowRadius: 12, elevation: 12,
  },
  controlIcon: { fontSize: 26 },
  ctrlLabel:   { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
});
