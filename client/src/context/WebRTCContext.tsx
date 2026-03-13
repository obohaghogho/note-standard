import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Peer, { type MediaConnection } from 'peerjs';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { CallOverlay } from '../components/chat/CallOverlay';
import toast from 'react-hot-toast';

// ─── PeerJS signaling config ─────────────────────────────────────
// Uses local server in DEV, public PeerJS cloud in PROD

// ─── Types ───────────────────────────────────────────────────────
interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected';
    otherUser: string | null;
    otherUserName?: string;
    otherUserAvatar?: string;
    conversationId: string | null;
}

interface WebRTCContextValue {
    callState: CallState;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    startCall: (userId: string, conversationId: string, type: 'voice' | 'video', name?: string, avatar?: string) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => void;
    endCall: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    isMuted: boolean;
    isVideoEnabled: boolean;
}

const WebRTCContext = createContext<WebRTCContextValue | null>(null);

export const useWebRTC = () => {
    const context = useContext(WebRTCContext);
    if (!context) throw new Error('useWebRTC must be used within a WebRTCProvider');
    return context;
};

function makePeerId(userId: string, suffix?: string): string {
    const base = `ns_${userId.replace(/-/g, '_')}`;
    return suffix ? `${base}_${suffix}` : base;
}

// ═════════════════════════════════════════════════════════════════
export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { user } = useAuth();
    const { sendMessage } = useChat();

    const [callState, setCallState] = useState<CallState>({
        type: null, status: 'idle', otherUser: null, conversationId: null,
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    const peerRef = useRef<Peer | null>(null);
    const mediaConnectionRef = useRef<MediaConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const callTimeoutRef = useRef<any>(null);
    const currentCallStatus = useRef<CallState['status']>('idle');
    const pendingCallRef = useRef<{ from: string; peerId: string; type: 'voice' | 'video' } | null>(null);

    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);

    // ─── Cleanup ─────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (mediaConnectionRef.current) { mediaConnectionRef.current.close(); mediaConnectionRef.current = null; }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        setLocalStream(null);
        setRemoteStream(null);
        pendingCallRef.current = null;
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
    }, []);

    // ─── PeerJS initialization ───────────────────────────────────
    useEffect(() => {
        if (!user?.id) return;
        if (peerRef.current) return;

        let destroyed = false;
        const MAX_RECONNECT = 3;

        function createPeer(suffix?: string) {
            if (destroyed) return;

            const peerId = makePeerId(user!.id, suffix);
            let reconnectAttempts = 0;

            const peerConfig = import.meta.env.DEV 
                ? { host: 'localhost', port: 9000, path: '/peerjs', secure: false }
                : {}; // Emtpy object uses PeerJS public cloud for signaling

            const peer = new Peer(peerId, {
                ...peerConfig,
                debug: import.meta.env.DEV ? 2 : 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ],
                },
            });

            peer.on('open', (id) => {
                console.log('[PeerJS] ✓ Connected:', id);
                reconnectAttempts = 0;
            });

            peer.on('call', (call) => {
                mediaConnectionRef.current = call;
                call.on('stream', (remote) => { setRemoteStream(remote); setCallState(p => ({ ...p, status: 'connected' })); });
                call.on('close', cleanup);
                call.on('error', () => { toast.error('Call error'); cleanup(); });
            });

            peer.on('error', (err: any) => {
                if (err.type === 'unavailable-id') {
                    console.warn('[PeerJS] ID taken — retrying…');
                    peer.destroy();
                    peerRef.current = null;
                    setTimeout(() => createPeer(Date.now().toString(36)), 500);
                    return;
                }
                if (err.type === 'network' || err.type === 'server-error') {
                    console.warn('[PeerJS] Signaling server unreachable. Calls unavailable.');
                }
            });

            peer.on('disconnected', () => {
                if (!destroyed && !peer.destroyed && reconnectAttempts < MAX_RECONNECT) {
                    reconnectAttempts++;
                    console.log(`[PeerJS] Reconnecting (${reconnectAttempts}/${MAX_RECONNECT})…`);
                    peer.reconnect();
                } else if (reconnectAttempts >= MAX_RECONNECT) {
                    console.warn('[PeerJS] Max reconnects reached. Calls unavailable.');
                }
            });

            peerRef.current = peer;
        }

        createPeer();

        return () => {
            destroyed = true;
            if (peerRef.current) {
                peerRef.current.destroy();
                peerRef.current = null;
            }
        };
    }, [user?.id]);

    // ─── Start Call ──────────────────────────────────────────────
    const startCall = async (otherUserId: string, conversationId: string, type: 'voice' | 'video', name?: string, avatar?: string) => {
        try {
            if (!peerRef.current) { toast.error('Connection not ready'); return; }
            setCallState({ type, status: 'calling', otherUser: otherUserId, otherUserName: name, otherUserAvatar: avatar, conversationId });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
            localStreamRef.current = stream;
            setLocalStream(stream);

            if (socket && user) {
                socket.emit('call:init', { to: otherUserId, type, conversationId, peerId: peerRef.current.id });
                sendMessage(`Started ${type} call`, 'call').catch(() => {});
            }

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    socket?.emit('call:end', { to: otherUserId, conversationId });
                    cleanup();
                }
            }, 45000);
        } catch {
            toast.error('Failed to access media');
            cleanup();
        }
    };

    // ─── Accept Call ─────────────────────────────────────────────
    const acceptCall = async () => {
        try {
            if (!peerRef.current || !pendingCallRef.current) { toast.error('Call data missing'); cleanup(); return; }
            const { type } = pendingCallRef.current;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
            localStreamRef.current = stream;
            setLocalStream(stream);

            if (mediaConnectionRef.current) {
                mediaConnectionRef.current.answer(stream);
                setCallState(p => ({ ...p, status: 'connecting' }));
            }
            socket?.emit('call:ready', { to: callState.otherUser, peerId: peerRef.current.id });
        } catch {
            toast.error('Failed to join call');
            cleanup();
        }
    };

    // ─── Reject / End ────────────────────────────────────────────
    const rejectCall = () => { socket?.emit('call:end', { to: callState.otherUser, conversationId: callState.conversationId }); cleanup(); };
    const endCall = () => { socket?.emit('call:end', { to: callState.otherUser, conversationId: callState.conversationId }); cleanup(); };

    // ─── Mute / Video ────────────────────────────────────────────
    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
        setIsMuted(!isMuted);
    };
    const toggleVideo = () => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !isVideoEnabled; });
        setIsVideoEnabled(!isVideoEnabled);
    };

    // ─── Socket.IO call signaling ────────────────────────────────
    useEffect(() => {
        if (!socket || !socketConnected) return;

        const onIncoming = (data: any) => {
            if (currentCallStatus.current !== 'idle') {
                socket.emit('call:end', { to: data.from, conversationId: data.conversationId });
                return;
            }
            pendingCallRef.current = { from: data.from, peerId: data.peerId, type: data.type };
            setCallState({
                type: data.type, status: 'incoming', otherUser: data.from,
                otherUserName: data.fromName, otherUserAvatar: data.fromAvatar,
                conversationId: data.conversationId,
            });
        };

        const onReady = (data: any) => {
            if (currentCallStatus.current === 'calling' && peerRef.current && localStreamRef.current) {
                if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
                const calleePeerId = data.peerId || makePeerId(data.from);
                const call = peerRef.current.call(calleePeerId, localStreamRef.current);
                if (!call) { toast.error('Failed to connect'); cleanup(); return; }

                mediaConnectionRef.current = call;
                setCallState(p => ({ ...p, status: 'connecting' }));
                call.on('stream', (remote) => { setRemoteStream(remote); setCallState(p => ({ ...p, status: 'connected' })); });
                call.on('close', cleanup);
                call.on('error', () => { toast.error('Call failed'); cleanup(); });
            }
        };

        const onEnded = () => cleanup();

        socket.on('call:incoming', onIncoming);
        socket.on('call:ready', onReady);
        socket.on('call:ended', onEnded);

        return () => {
            socket.off('call:incoming', onIncoming);
            socket.off('call:ready', onReady);
            socket.off('call:ended', onEnded);
        };
    }, [socket, socketConnected, cleanup]);

    return (
        <WebRTCContext.Provider value={{
            callState, localStream, remoteStream,
            startCall, acceptCall, rejectCall, endCall,
            toggleMute, toggleVideo, isMuted, isVideoEnabled,
        }}>
            {children}
            {callState.status !== 'idle' && (
                <CallOverlay
                    callState={callState}
                    acceptCall={acceptCall}
                    rejectCall={rejectCall}
                    endCall={endCall}
                    localStream={localStream}
                    remoteStream={remoteStream}
                    toggleMute={toggleMute}
                    toggleVideo={toggleVideo}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                    otherUserName={callState.otherUserName || 'User'}
                    otherUserAvatar={callState.otherUserAvatar}
                />
            )}
        </WebRTCContext.Provider>
    );
};
