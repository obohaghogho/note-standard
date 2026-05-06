import { io, Socket } from 'socket.io-client';
import CallService from './CallService';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || 'http://localhost:5001';

class SignalingService {
  private socket: Socket | null = null;
  private userId: string | null = null;

  async init(userToken: string, userId: string) {
    this.userId = userId;

    // 1. Initialize Socket.io
    this.socket = io(GATEWAY_URL, {
      auth: { token: userToken },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('[Signaling] Connected to gateway');
    });

    this.socket.on('call:incoming', (data) => {
      console.log('[Signaling] Incoming call via socket:', data);
      CallService.displayIncomingCall({
        callerId: data.from,
        callerName: data.fromName,
        callType: data.type,
        conversationId: data.conversationId,
        peerId: data.peerId
      });
    });

    this.socket.on('call:ended', () => {
      CallService.endCall();
    });

    // 2. Register native token for this user
    try {
      // In a real app, you'd get the actual token from PushHandler
      // This is a placeholder for the registration logic
    } catch (err) {
      console.error('[Signaling] Failed to register token:', err);
    }
  }

  emit(event: string, data: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  async startCall(targetUserId: string, targetName: string, type: 'audio' | 'video', conversationId: string) {
    console.log(`[Signaling] Initiating ${type} call to ${targetUserId}`);
    
    // 1. Notify Native Call UI
    const callId = await CallService.startCall({
      callerId: targetUserId,
      callerName: targetName,
      callType: type,
      conversationId,
      peerId: this.userId || '' // We pass our ID as the peer for the other side
    });

    // 2. Emit to Gateway
    this.emit('call:initiate', {
      to: targetUserId,
      type,
      conversationId,
      peerId: this.userId
    });

    return callId;
  }

  rejectCall(targetUserId: string) {
    this.emit('call:reject', { to: targetUserId });
    CallService.rejectCall();
  }

  answerCall(targetUserId: string, peerId: string) {
    this.emit('call:ready', { to: targetUserId, peerId });
    // Connect WebRTC here
  }
}

export default new SignalingService();
