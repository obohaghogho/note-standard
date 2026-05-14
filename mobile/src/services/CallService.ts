/**
 * CallService – Pure in-app VoIP call management.
 *
 * ❌ Does NOT use RNCallKeep, TelecomManager, Linking.openURL or tel: links.
 * ✅ Uses a simple EventEmitter to dispatch call state changes within the app.
 *
 * Call state machine:
 *   idle → calling → ringing → connecting → connected → ended / failed
 */
import EventEmitter from './EventEmitter';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'failed';

export interface CallData {
  callerId: string;
  callerName: string;
  callType: 'audio' | 'video';
  conversationId: string;
}

// Typed event names
export const CALL_EVENTS = {
  STATE_CHANGE:      'call:stateChange',
  INCOMING:          'call:incoming',
  ENDED:             'call:ended',
  REJECTED:          'call:rejected',
  SHOW_INCOMING_UI:  'call:showIncomingUI',
} as const;

class CallService {
  private state: CallState = 'idle';
  private currentCall: CallData | null = null;
  private ringtoneSound: Audio.Sound | null = null;
  private callTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CALL_TIMEOUT_MS = 45_000;

  // ── State management ──────────────────────────────────────────────────────

  getState(): CallState {
    return this.state;
  }

  getCurrentCall(): CallData | null {
    return this.currentCall;
  }

  private setState(newState: CallState) {
    if (this.state === newState) return;
    console.log(`[CallService] State: ${this.state} → ${newState}`);
    this.state = newState;
    EventEmitter.emit(CALL_EVENTS.STATE_CHANGE, { state: newState, call: this.currentCall });
  }

  // ── Ringtone ──────────────────────────────────────────────────────────────

  private async startRingtone() {
    await this.stopRingtone();
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        playsInSilentModeIOS: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        // Use the ringtone asset if it exists, otherwise gracefully skip
        require('../../assets/ringtone.mp3'),
        { isLooping: true, volume: 1.0 }
      );
      this.ringtoneSound = sound;
      await sound.playAsync();
    } catch (err) {
      console.warn('[CallService] Ringtone unavailable:', err);
    }
  }

  async stopRingtone() {
    if (!this.ringtoneSound) return;
    try {
      await this.ringtoneSound.stopAsync();
      await this.ringtoneSound.unloadAsync();
    } catch (_) {}
    this.ringtoneSound = null;
  }

  // ── Timeout management ────────────────────────────────────────────────────

  private startCallTimeout() {
    this.clearCallTimeout();
    this.callTimeoutTimer = setTimeout(() => {
      console.log('[CallService] Call timed out');
      this.handleCallEnded('timeout');
    }, this.CALL_TIMEOUT_MS);
  }

  private clearCallTimeout() {
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }
  }

  // ── Outgoing call ─────────────────────────────────────────────────────────

  async startOutgoingCall(data: CallData) {
    if (this.state !== 'idle') {
      console.warn('[CallService] Already in a call – ignoring startOutgoingCall');
      return;
    }
    console.log(`[CallService] 📞 Starting outgoing ${data.callType} call to ${data.callerName}`);
    this.currentCall = data;
    this.setState('calling');
    this.startCallTimeout();
  }

  // ── Incoming call ─────────────────────────────────────────────────────────

  async displayIncomingCall(data: CallData) {
    if (this.state !== 'idle') {
      console.warn('[CallService] Already in a call – ignoring incoming');
      return;
    }
    console.log(`[CallService] 📲 Incoming ${data.callType} call from ${data.callerName}`);
    this.currentCall = data;
    this.setState('ringing');
    this.startCallTimeout();
    await this.startRingtone();
    EventEmitter.emit(CALL_EVENTS.SHOW_INCOMING_UI, data);
  }

  // ── Answer ────────────────────────────────────────────────────────────────

  async answerCall() {
    if (this.state !== 'ringing') return;
    this.clearCallTimeout();
    await this.stopRingtone();
    this.setState('connecting');
  }

  onCallConnected() {
    this.clearCallTimeout();
    this.setState('connected');
  }

  // ── End / Reject ──────────────────────────────────────────────────────────

  async rejectCall() {
    if (this.state === 'idle') return;
    this.clearCallTimeout();
    await this.stopRingtone();
    const call = this.currentCall;
    this.currentCall = null;
    this.setState('ended');
    EventEmitter.emit(CALL_EVENTS.REJECTED, call);
    // Reset to idle after short delay so UI can animate out
    setTimeout(() => this.setState('idle'), 500);
  }

  async handleCallEnded(reason: 'normal' | 'timeout' | 'remote' | 'error' = 'normal') {
    if (this.state === 'idle') return;
    this.clearCallTimeout();
    await this.stopRingtone();
    const call = this.currentCall;
    this.currentCall = null;
    this.setState(reason === 'error' ? 'failed' : 'ended');
    EventEmitter.emit(CALL_EVENTS.ENDED, { call, reason });
    setTimeout(() => this.setState('idle'), 500);
  }

  // ── Event subscription helpers ────────────────────────────────────────────

  onStateChange(cb: (payload: { state: CallState; call: CallData | null }) => void) {
    EventEmitter.on(CALL_EVENTS.STATE_CHANGE, cb);
    return () => EventEmitter.off(CALL_EVENTS.STATE_CHANGE, cb);
  }

  onShowIncomingCallUI(cb: (data: CallData) => void) {
    EventEmitter.on(CALL_EVENTS.SHOW_INCOMING_UI, cb);
    return () => EventEmitter.off(CALL_EVENTS.SHOW_INCOMING_UI, cb);
  }

  onCallEnded(cb: (payload: { call: CallData | null; reason: string }) => void) {
    EventEmitter.on(CALL_EVENTS.ENDED, cb);
    return () => EventEmitter.off(CALL_EVENTS.ENDED, cb);
  }

  onCallRejected(cb: (call: CallData | null) => void) {
    EventEmitter.on(CALL_EVENTS.REJECTED, cb);
    return () => EventEmitter.off(CALL_EVENTS.REJECTED, cb);
  }
}

export default new CallService();
