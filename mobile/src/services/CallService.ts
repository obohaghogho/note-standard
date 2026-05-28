/**
 * CallService – Native Hybrid VoIP Call Management.
 *
 * ✅ Fully integrates RNCallKeep for iOS CallKit and Android ConnectionService.
 * ✅ Supports native lock-screen answering, native UI, and system call logs.
 * ✅ Syncs native call state with internal app WebRTC state.
 */
import EventEmitter from './EventEmitter';
import RNCallKeep from 'react-native-callkeep';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

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
  sessionId?: string; // WebRTC Session ID for signaling
  uuid?: string; // Native call UUID
}

// Typed event names
export const CALL_EVENTS = {
  STATE_CHANGE:      'call:stateChange',
  INCOMING:          'call:incoming',
  ENDED:             'call:ended',
  REJECTED:          'call:rejected',
  SHOW_INCOMING_UI:  'call:showIncomingUI', // Kept for Android fallback/self-managed UI
} as const;

class CallService {
  private state: CallState = 'idle';
  private currentCall: CallData | null = null;
  private currentCallUUID: string | null = null;
  
  private ringtoneSound: Audio.Sound | null = null;
  private callTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CALL_TIMEOUT_MS = 45_000;

  constructor() {
    // Note: Global CallKeep listeners are bound in PushHandler/index.ts to catch background calls.
    // CallService manages the active state for the foreground React application.
  }

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

  // ── Ringtone (Android Fallback) ───────────────────────────────────────────

  private async startRingtoneFallback() {
    if (Platform.OS === 'ios') return; // iOS CallKit handles its own ringtone always
    await this.stopRingtoneFallback();
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
        require('../../assets/ringtone.mp3'),
        { isLooping: true, volume: 1.0 }
      );
      this.ringtoneSound = sound;
      await sound.playAsync();
    } catch (err) {
      console.warn('[CallService] Fallback ringtone unavailable:', err);
    }
  }

  async stopRingtoneFallback() {
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
    
    this.currentCallUUID = uuidv4();
    data.uuid = this.currentCallUUID;
    this.currentCall = data;
    
    this.setState('calling');
    this.startCallTimeout();

    // Trigger native OS outgoing call UI
    RNCallKeep.startCall(
      this.currentCallUUID,
      data.callerName,
      data.callerName,
      'generic',
      data.callType === 'video'
    );
  }

  // ── Incoming call ─────────────────────────────────────────────────────────

  async displayIncomingCall(data: CallData) {
    if (this.state !== 'idle' && this.state !== 'ringing') {
      console.warn('[CallService] Already in a call – ignoring incoming');
      return;
    }
    
    console.log(`[CallService] 📲 Incoming ${data.callType} call from ${data.callerName}`);
    
    // UUID may have already been created by a background push notification
    this.currentCallUUID = data.uuid || this.currentCallUUID || uuidv4();
    data.uuid = this.currentCallUUID;
    this.currentCall = data;
    
    this.setState('ringing');
    this.startCallTimeout();

    // Trigger native OS incoming call UI
    RNCallKeep.displayIncomingCall(
      this.currentCallUUID,
      data.callerName,
      data.callerName,
      'generic',
      data.callType === 'video'
    );

    // Fallback in-app UI for Android if the native intent doesn't grab screen focus
    if (Platform.OS === 'android') {
      await this.startRingtoneFallback();
      EventEmitter.emit(CALL_EVENTS.SHOW_INCOMING_UI, data);
    }
  }

  // ── Answer ────────────────────────────────────────────────────────────────

  async answerCall(uuid?: string) {
    // If UUID is passed (e.g. from native CallKeep callback), ensure it matches
    if (uuid && uuid !== this.currentCallUUID) {
      console.warn(`[CallService] Answer request for unknown UUID: ${uuid}`);
      // In a real app we might update the active call, but we assume 1 concurrent call
    }
    
    this.clearCallTimeout();
    await this.stopRingtoneFallback();
    this.setState('connecting');
    
    // If this was triggered from the app UI, tell the OS we answered
    if (this.currentCallUUID) {
      RNCallKeep.answerIncomingCall(this.currentCallUUID);
    }
  }

  onCallConnected() {
    this.clearCallTimeout();
    this.setState('connected');
    
    if (this.currentCallUUID) {
      RNCallKeep.setCurrentCallActive(this.currentCallUUID);
    }
  }

  // ── End / Reject ──────────────────────────────────────────────────────────

  async rejectCall(uuid?: string) {
    if (this.state === 'idle') return;
    this.clearCallTimeout();
    await this.stopRingtoneFallback();
    
    const targetUuid = uuid || this.currentCallUUID;
    if (targetUuid) {
      RNCallKeep.rejectCall(targetUuid);
    }

    const call = this.currentCall;
    this.currentCall = null;
    this.currentCallUUID = null;
    this.setState('ended');
    
    EventEmitter.emit(CALL_EVENTS.REJECTED, call);
    setTimeout(() => this.setState('idle'), 500);
  }

  async handleCallEnded(reason: 'normal' | 'timeout' | 'remote' | 'error' = 'normal') {
    if (this.state === 'idle') return;
    this.clearCallTimeout();
    await this.stopRingtoneFallback();

    if (this.currentCallUUID) {
      // Different CallKeep reasons based on internal logic mapping
      if (reason === 'remote') {
        RNCallKeep.reportEndCallWithUUID(this.currentCallUUID, 2); // 2 = Remote ended
      } else if (reason === 'error') {
        RNCallKeep.reportEndCallWithUUID(this.currentCallUUID, 1); // 1 = Failed
      } else {
        RNCallKeep.endCall(this.currentCallUUID);
      }
    }

    const call = this.currentCall;
    this.currentCall = null;
    this.currentCallUUID = null;
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
