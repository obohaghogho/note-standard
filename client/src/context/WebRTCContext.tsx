import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import toast from 'react-hot-toast';
import { CallOverlay } from '../components/chat/CallOverlay';

interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
    otherUser: {
        id: string;
        full_name: string;
        avatar_url?: string;
    } | null;
    conversationId: string | null;
    connectedAt: number | null;
}

interface WebRTCContextType {
    callState: CallState;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    isVideoEnabled: boolean;
    startCall: (targetUserId: string, conversationId: string, type: 'voice' | 'video', otherUser: CallState['otherUser']) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => void;
    endCall: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

export const useWebRTC = () => {
    const context = useContext(WebRTCContext);
    if (!context) {
        throw new Error('useWebRTC must be used within a WebRTCProvider');
    }
    return context;
};

function makePeerId(userId: string, suffix?: string): string {
    const base = `ns_${userId.replace(/-/g, '_')}`;
    return suffix ? `${base}_${suffix}` : base;
}

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { user } = useAuth();
    const { sendMessage } = useChat();

    // 🕵️ Auth Handshake Diagnostic
    console.warn('[WebRTC] 🛡️ Provider Status:', { mounted: true, authReady: !!user, userId: user?.id });

    const [callState, setCallState] = useState<CallState>({
        type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null,
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    const peerRef = useRef<Peer | null>(null);
    const mediaConnectionRef = useRef<MediaConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentCallStatus = useRef<CallState['status']>('idle');
    const pendingCallRef = useRef<{ from: string; peerId: string; type: 'voice' | 'video' } | null>(null);

    const dialToneRef = useRef<HTMLAudioElement | null>(null);
    const incomingRingtoneRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        dialToneRef.current = new Audio('/sounds/ringtone.wav');
        dialToneRef.current.loop = true;
        dialToneRef.current.volume = 0.5;
        incomingRingtoneRef.current = new Audio('/sounds/ringing.wav');
        incomingRingtoneRef.current.loop = true;
        incomingRingtoneRef.current.volume = 0.8;

        return () => {
            if (dialToneRef.current) { dialToneRef.current.pause(); dialToneRef.current = null; }
            if (incomingRingtoneRef.current) { incomingRingtoneRef.current.pause(); incomingRingtoneRef.current = null; }
        };
    }, []);

    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);

    const playAudio = useCallback((audio: HTMLAudioElement | null, label: string) => {
        if (!audio) return;
        const playPromise = audio.play();
        if (playPromise) {
            playPromise.catch((err) => {
                console.warn(`[Audio] ${label} play blocked:`, err.message);
                toast(`🔇 Tap anywhere to enable ${label}`, {
                    duration: 3000,
                    id: `audio-unlock-${label}`,
                });
                const unlockAudio = () => {
                    audio.play().catch(() => { });
                    document.removeEventListener('click', unlockAudio);
                    document.removeEventListener('touchstart', unlockAudio);
                };
                document.addEventListener('click', unlockAudio, { once: true });
                document.addEventListener('touchstart', unlockAudio, { once: true });
            });
        }
    }, []);

    useEffect(() => {
        const stopAll = () => {
            dialToneRef.current?.pause();
            if (dialToneRef.current) dialToneRef.current.currentTime = 0;
            incomingRingtoneRef.current?.pause();
            if (incomingRingtoneRef.current) incomingRingtoneRef.current.currentTime = 0;
        };

        if (callState.status === 'calling') {
            stopAll();
            playAudio(dialToneRef.current, 'dial tone');
        } else if (callState.status === 'incoming') {
            stopAll();
            playAudio(incomingRingtoneRef.current, 'ringtone');
        } else {
            stopAll();
        }
    }, [callState.status, playAudio]);

    const cleanup = useCallback(() => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (mediaConnectionRef.current) { mediaConnectionRef.current.close(); mediaConnectionRef.current = null; }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        
        dialToneRef.current?.pause();
        if (dialToneRef.current) dialToneRef.current.currentTime = 0;
        incomingRingtoneRef.current?.pause();
        if (incomingRingtoneRef.current) incomingRingtoneRef.current.currentTime = 0;

        setLocalStream(null);
        setRemoteStream(null);
        pendingCallRef.current = null;
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
    }, []);

    useEffect(() => {
        console.warn('[WebRTC] 🔄 Initialization Effect Triggered', { userId: user?.id });
        if (!user?.id) return;
        if (peerRef.current) return;

        let destroyed = false;
        const MAX_RECONNECT = 5;

        function createPeer(suffix?: string) {
            const peerId = makePeerId(user!.id, suffix || Math.random().toString(36).substring(7));
            let reconnectAttempts = 0;

            const hostname = window.location.hostname;
            const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
            
            const peerHost = isDev ? 'localhost' : '0.peerjs.com';
            const peerPort = isDev ? parseInt(import.meta.env.VITE_PEER_PORT || '9000') : 443;
            const peerPath = isDev ? '/peerjs' : '/';
            const peerSecure = !isDev || import.meta.env.VITE_PEER_SECURE === 'true';

            console.warn('[WebRTC] 👋 Connecting with config:', { 
                host: peerHost, 
                port: peerPort, 
                path: peerPath, 
                secure: peerSecure,
                env: isDev ? 'DEV' : 'PROD' 
            });

            const peer = new Peer(peerId, {
                host: peerHost,
                port: peerPort,
                path: peerPath,
                secure: peerSecure,
                key: 'peerjs',
                debug: 3,
                pingInterval: 3000,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                    ],
                },
            });

            peer.on('open', (id) => {
                console.warn('[PeerJS] ✓ Connected:', id);
                reconnectAttempts = 0;
            });

            peer.on('call', async (call) => {
                const callerPeerId = call.peer;
                const metadata = call.metadata || {};
                
                if (currentCallStatus.current !== 'idle') {
                    call.answer();
                    setTimeout(() => call.close(), 500);
                    return;
                }

                pendingCallRef.current = { from: callerPeerId, peerId: callerPeerId, type: metadata.type || 'voice' };
                mediaConnectionRef.current = call;

                setCallState({
                    type: metadata.type || 'voice',
                    status: 'incoming',
                    otherUser: metadata.caller || { id: 'unknown', full_name: 'Unknown User' },
                    conversationId: metadata.conversationId || 'unknown',
                    connectedAt: null,
                });
            });

            peer.on('disconnected', () => {
                if (destroyed) return;
                console.warn('[PeerJS] Disconnected from server.');
                if (reconnectAttempts < MAX_RECONNECT) {
                    reconnectAttempts++;
                    setTimeout(() => peer.reconnect(), 3000);
                }
            });

            peer.on('error', (err: any) => {
                console.error('[PeerJS] Error:', err.type, err);
                if (err.type === 'unavailable-id') {
                    peer.destroy();
                    createPeer(Math.random().toString(36).substring(7));
                } else if (err.type === 'peer-unavailable') {
                    toast.error('User is offline or unavailable');
                    cleanup();
                } else if (err.type === 'network' || err.type === 'server-error') {
                    if (reconnectAttempts < MAX_RECONNECT) {
                        reconnectAttempts++;
                        setTimeout(() => peer.reconnect(), 3000);
                    }
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
    }, [user?.id, cleanup]);

    const startCall = async (targetUserId: string, conversationId: string, type: 'voice' | 'video', otherUser: CallState['otherUser']) => {
        if (!peerRef.current || !peerRef.current.open) {
            toast.error('Signaling server not ready');
            return;
        }

        setCallState({ type, status: 'calling', otherUser, conversationId, connectedAt: null });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video',
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            socket?.emit('call:initiate', { to: targetUserId, from: user!.id, peerId: peerRef.current.id, type });
            sendMessage(conversationId, `Started a ${type} call`, 'system');

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    socket?.emit('call:timeout', { to: targetUserId });
                    cleanup();
                }
            }, 45000);

        } catch (err) {
            console.error('[WebRTC] Camera/Mic Error:', err);
            toast.error('Please allow camera/mic access');
            cleanup();
        }
    };

    const acceptCall = async () => {
        if (!peerRef.current || !mediaConnectionRef.current) {
            cleanup();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callState.type === 'video',
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            mediaConnectionRef.current.answer(stream);
            setCallState(p => ({ ...p, status: 'connected', connectedAt: Date.now() }));

            mediaConnectionRef.current.on('stream', (remote) => {
                setRemoteStream(remote);
                setCallState(p => ({ ...p, status: 'connected' }));
            });

            mediaConnectionRef.current.on('close', () => cleanup());
            mediaConnectionRef.current.on('error', () => cleanup());

        } catch (err) {
            console.error('[WebRTC] Accept Error:', err);
            cleanup();
        }
    };

    const rejectCall = () => {
        socket?.emit('call:reject', { to: callState.otherUser?.id, from: user!.id });
        cleanup();
    };

    const endCall = () => {
        socket?.emit('call:end', { to: callState.otherUser?.id, from: user!.id });
        cleanup();
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = isMuted);
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !isVideoEnabled);
            setIsVideoEnabled(!isVideoEnabled);
        }
    };

    useEffect(() => {
        if (!socket || !socketConnected) return;

        const handleCallRejected = () => cleanup();
        const handleCallEnded = () => cleanup();
        const handleCallTimeout = () => cleanup();

        socket.on('call:rejected', handleCallRejected);
        socket.on('call:ended', handleCallEnded);
        socket.on('call:timeout', handleCallTimeout);

        return () => {
            socket.off('call:rejected', handleCallRejected);
            socket.off('call:ended', handleCallEnded);
            socket.off('call:timeout', handleCallTimeout);
        };
    }, [socket, socketConnected, cleanup]);

    return (
        <WebRTCContext.Provider value={{
            callState, localStream, remoteStream, isMuted, isVideoEnabled,
            startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo
        }}>
            {children}
            {callState.status !== 'idle' && (
                <CallOverlay 
                    callState={{
                        type: callState.type,
                        status: callState.status as any,
                        connectedAt: callState.connectedAt
                    }}
                    localStream={localStream}
                    remoteStream={remoteStream}
                    acceptCall={acceptCall}
                    rejectCall={rejectCall}
                    endCall={endCall}
                    toggleMute={toggleMute}
                    toggleVideo={toggleVideo}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                    otherUserName={callState.otherUser?.full_name || 'Unknown'}
                    otherUserAvatar={callState.otherUser?.avatar_url}
                />
            )}
        </WebRTCContext.Provider>
    );
};
