import RNCallKeep from 'react-native-callkeep';
import { Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

export interface CallData {
  callerId: string;
  callerName: string;
  callType: 'audio' | 'video';
  conversationId: string;
  peerId: string;
}

class CallService {
  private isInitialized = false;
  private currentCallId: string | null = null;

  async setup() {
    if (this.isInitialized) return;

    const options = {
      ios: {
        appName: 'NoteStandard',
        imageName: 'sim_icon',
        supportsVideo: true,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: false, // Don't clutter recents with VoIP calls
        audioSession: {
            category: 'PlayAndRecord',
            mode: 'VoiceChat',
            options: ['AllowBluetooth', 'DefaultToSpeaker'],
        }
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'This application needs to access your phone accounts for VoIP synchronization',
        cancelButton: 'Cancel',
        okButton: 'ok',
        imageName: 'phone_account_icon',
        selfManaged: true, // Use custom UI
        additionalPermissions: [],
        foregroundService: {
          channelId: 'com.notestandard.app.calls',
          channelName: 'Incoming Calls',
          notificationTitle: 'Incoming Call',
          notificationIcon: 'phone_account_icon',
        },
      },
    };

    try {
      await RNCallKeep.setup(options);
      RNCallKeep.setAvailable(true);
      
      this.isInitialized = true;
      console.log('[CallService] RNCallKeep setup complete (Self-Managed Mode).');
    } catch (err) {
      console.error('[CallService] Setup error:', err);
    }
  }

  async startCall(data: CallData) {
    const callId = uuidv4();
    this.currentCallId = callId;
    
    console.log(`[CallService] 📞 Starting outgoing VoIP call to ${data.callerName}`);
    
    try {
      RNCallKeep.startCall(
        callId,
        data.callerId,
        data.callerName,
        'generic',
        data.callType === 'video'
      );
    } catch (err) {
      console.error(`[CallService] ❌ Start call error:`, err);
    }
    
    return callId;
  }

  displayIncomingCall(data: CallData) {
    const callId = uuidv4();
    this.currentCallId = callId;

    console.log(`[CallService] 📞 Showing incoming VoIP call UI from ${data.callerName}`);

    try {
      RNCallKeep.displayIncomingCall(
        callId,
        data.callerId,
        data.callerName,
        'generic',
        data.callType === 'video'
      );
    } catch (err) {
      console.error(`[CallService] ❌ Display error:`, err);
    }
    
    return callId;
  }

  answerCall() {
    if (this.currentCallId) {
      console.log(`[CallService] 📲 Answering Call (ID: ${this.currentCallId})`);
      RNCallKeep.answerCall(this.currentCallId);
      if (Platform.OS === 'ios') {
          setTimeout(() => {
              RNCallKeep.setAudioRoute(this.currentCallId!, 'Speaker');
          }, 500);
      }
    }
  }

  endCall() {
    if (this.currentCallId) {
      console.log(`[CallService] 🏁 Ending Call (ID: ${this.currentCallId})`);
      RNCallKeep.endCall(this.currentCallId);
      this.currentCallId = null;
    }
  }

  rejectCall() {
    if (this.currentCallId) {
      console.log(`[CallService] 🚫 Rejecting Call (ID: ${this.currentCallId})`);
      RNCallKeep.rejectCall(this.currentCallId);
      this.currentCallId = null;
    }
  }

  onAnswer(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => callback(callUUID));
  }

  onReject(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('endCall', ({ callUUID }) => callback(callUUID));
  }

  onShowIncomingCallUI(callback: (data: any) => void) {
    RNCallKeep.addEventListener('showIncomingCallUi', (data) => callback(data));
  }
}

export default new CallService();
