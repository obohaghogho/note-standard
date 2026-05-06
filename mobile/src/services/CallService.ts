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
        includesCallsInRecents: true,
        // Advanced iOS configurations for echo reduction
        audioSession: {
            category: 'PlayAndRecord',
            mode: 'VoiceChat',
            options: ['AllowBluetooth', 'DefaultToSpeaker'],
        }
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'This application needs to access your phone accounts',
        cancelButton: 'Cancel',
        okButton: 'ok',
        imageName: 'phone_account_icon',
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
      
      // Setup listeners for audio session (iOS specific)
      if (Platform.OS === 'ios') {
          RNCallKeep.addEventListener('didActivateAudioSession', () => {
              console.log('[CallService] 🔊 Audio Session Activated');
              // This is where you'd start your WebRTC audio stream
          });
      }

      this.isInitialized = true;
      console.log('[CallService] RNCallKeep setup complete with iOS CallKit optimizations.');
    } catch (err) {
      console.error('[CallService] Setup error:', err);
    }
  }

  async startCall(data: CallData) {
    const callId = uuidv4();
    this.currentCallId = callId;
    
    console.log(`[CallService] 📞 Starting outgoing call to ${data.callerName}`);
    
    try {
      RNCallKeep.startCall(
        callId,
        data.callerId,
        data.callerName,
        'generic',
        data.callType === 'video'
      );
      
      // For outgoing calls, you might want to play a local dial tone
      // until the other side answers.
    } catch (err) {
      console.error(`[CallService] ❌ Start call error:`, err);
    }
    
    return callId;
  }

  displayIncomingCall(data: CallData) {
    const callId = uuidv4();
    this.currentCallId = callId;

    console.log(`[CallService] 📞 Incoming call from ${data.callerName}`);

    try {
      RNCallKeep.displayIncomingCall(
        callId,
        data.callerId,
        data.callerName,
        'generic',
        data.callType === 'video'
      );
      
      // On iOS, displayIncomingCall triggers the system ringtone automatically 
      // if the audio session is managed correctly by the OS.
    } catch (err) {
      console.error(`[CallService] ❌ Display error:`, err);
    }
  }

  answerCall() {
    console.log(`[CallService] 📲 Answering Call (ID: ${this.currentCallId})`);
    if (this.currentCallId) {
      RNCallKeep.answerCall(this.currentCallId);
      // Ensure audio is routed to speaker by default for best echo cancellation hardware usage
      if (Platform.OS === 'ios') {
          setTimeout(() => {
              RNCallKeep.setAudioRoute(this.currentCallId!, 'Speaker');
          }, 1000);
      }
    }
  }

  endCall() {
    console.log(`[CallService] 🏁 Ending Call (ID: ${this.currentCallId})`);
    if (this.currentCallId) {
      RNCallKeep.endCall(this.currentCallId);
      this.currentCallId = null;
    }
  }

  rejectCall() {
    console.log(`[CallService] 🚫 Rejecting/Ending Call UI (ID: ${this.currentCallId})`);
    if (this.currentCallId) {
      RNCallKeep.rejectCall(this.currentCallId);
      this.currentCallId = null;
    }
  }

  // Event Listeners
  onAnswer(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      callback(callUUID);
    });
  }

  onReject(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      callback(callUUID);
    });
  }
  
  // Important for iOS: Handle the system telling the app to end the call
  onEndCall(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      this.currentCallId = null;
      callback(callUUID);
    });
  }
}

export default new CallService();
