/**
 * IncomingCallModal – Pure in-app incoming call UI.
 *
 * ❌ No RNCallKeep, no telecom, no Linking.openURL
 * ✅ Subscribes to CallService events via EventEmitter
 * ✅ Stops ringtone on answer, reject, timeout or remote hang-up
 * ✅ Navigates to CallScreen on answer
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CallService, { CallData, CallState } from '../services/CallService';
import SignalingService from '../services/SignalingService';
import { navigate } from '../navigation/AppNavigator';

export default function IncomingCallModal() {
  const [visible, setVisible] = useState(false);
  const [callData, setCallData] = useState<CallData | null>(null);

  // Pulse animation for the avatar
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // ── Pulse animation ─────────────────────────────────────────────────────

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  };

  // ── Subscribe to CallService events ─────────────────────────────────────

  useEffect(() => {
    // Show UI when an incoming call arrives
    const unsubIncoming = CallService.onShowIncomingCallUI((data: CallData) => {
      setCallData(data);
      setVisible(true);
      startPulse();
    });

    // Hide UI if call ended remotely (caller hung up, timeout, etc.)
    const unsubEnded = CallService.onCallEnded(() => {
      close();
    });

    const unsubRejected = CallService.onCallRejected(() => {
      close();
    });

    // Also react to state changes — hide when no longer ringing
    const unsubState = CallService.onStateChange(({ state }: { state: CallState }) => {
      if (state === 'idle' || state === 'ended' || state === 'failed') {
        close();
      }
    });

    return () => {
      unsubIncoming();
      unsubEnded();
      unsubRejected();
      unsubState();
      stopPulse();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAnswer = async () => {
    stopPulse();
    setVisible(false);

    if (!callData) return;
    await SignalingService.answerCall();

    navigate('Call', {
      type: callData.callType,
      conversationId: callData.conversationId,
      targetUserId: callData.callerId,
      targetName: callData.callerName,
      isIncoming: true,
    });
    setCallData(null);
  };

  const handleReject = async () => {
    stopPulse();
    setVisible(false);
    setCallData(null);
    await SignalingService.rejectIncomingCall();
  };

  const close = () => {
    stopPulse();
    setVisible(false);
    setCallData(null);
  };

  if (!visible || !callData) return null;

  const initials = (callData.callerName || 'U').charAt(0).toUpperCase();
  const callLabel = callData.callType === 'video' ? '📹 Video Call' : '🎧 Audio Call';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <LinearGradient
        colors={['rgba(10,10,30,0.97)', 'rgba(30,27,75,0.97)']}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Caller avatar */}
          <Animated.View style={[styles.avatarWrap, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          </Animated.View>

          <Text style={styles.incomingLabel}>{callLabel}</Text>
          <Text style={styles.callerName}>{callData.callerName}</Text>
          <Text style={styles.appLabel}>NoteStandard</Text>

          {/* Answer / Reject buttons */}
          <View style={styles.controls}>
            <View style={styles.btnWrap}>
              <TouchableOpacity onPress={handleReject} style={styles.rejectBtn} activeOpacity={0.8}>
                <Text style={styles.rejectIcon}>📵</Text>
              </TouchableOpacity>
              <Text style={styles.btnLabel}>Decline</Text>
            </View>

            <View style={styles.btnWrap}>
              <TouchableOpacity onPress={handleAnswer} style={styles.answerBtn} activeOpacity={0.8}>
                <Text style={styles.answerIcon}>📞</Text>
              </TouchableOpacity>
              <Text style={styles.btnLabel}>Answer</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '88%',
    backgroundColor: '#0d0d1e',
    borderRadius: 32,
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#1e1e3a',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  avatarWrap: {
    marginBottom: 28,
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 52,
    fontWeight: 'bold',
  },
  incomingLabel: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  callerName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  appLabel: {
    color: '#555',
    fontSize: 13,
    marginBottom: 48,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
  },
  btnWrap: {
    alignItems: 'center',
    gap: 10,
  },
  answerBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  answerIcon: {
    fontSize: 32,
  },
  rejectBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  rejectIcon: {
    fontSize: 32,
  },
  btnLabel: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
});
