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
        },
      },
    };

    try {
      await RNCallKeep.setup(options);
      RNCallKeep.setAvailable(true);
      this.isInitialized = true;
      console.log('[CallService] RNCallKeep setup complete.');
    } catch (err) {
      console.error('[CallService] Setup error:', err);
    }
  }

  displayIncomingCall(data: CallData) {
    const callId = uuidv4();
    this.currentCallId = callId;

    console.log(`[CallService] 📞 PRE-DISPLAY: Displaying incoming call for ${data.callerName} (ID: ${data.callerId})`);
    console.log(`[CallService] 🕒 Timestamp: ${new Date().toISOString()}`);

    try {
      RNCallKeep.displayIncomingCall(
        callId,
        data.callerId, // number or identifier
        data.callerName, // name
        'generic', // numberType
        data.callType === 'video'
      );
      console.log(`[CallService] ✅ POS-DISPLAY: displayIncomingCall invoked successfully.`);
    } catch (err) {
      console.error(`[CallService] ❌ DISPLAY ERROR:`, err);
    }
  }

  answerCall() {
    console.log(`[CallService] 📲 User Answered Call (ID: ${this.currentCallId})`);
    if (this.currentCallId) {
      RNCallKeep.answerCall(this.currentCallId);
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
    console.log(`[CallService] 🚫 User Rejected/Missed Call (ID: ${this.currentCallId})`);
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
}

export default new CallService();
