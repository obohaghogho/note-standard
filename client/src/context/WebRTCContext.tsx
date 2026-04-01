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
    connectedAt?: number | null;
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
        type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null,
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

    // Audio Refs for ringtones
    // dialToneRef = calm ring-ring sound the CALLER hears while waiting
    // incomingRingtoneRef = attention-grabbing sound the CALLEE hears for incoming call
    const dialToneRef = useRef<HTMLAudioElement | null>(null);
    const incomingRingtoneRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize audio objects
        // ringtone.wav = calm dial tone for caller
        // ringing.wav = attention-grabbing ringtone for callee
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

    // Robust audio playback — handles browser autoplay restrictions
    const playAudio = useCallback((audio: HTMLAudioElement | null, label: string) => {
        if (!audio) return;
        const playPromise = audio.play();
        if (playPromise) {
            playPromise.catch((err) => {
                console.warn(`[Audio] ${label} play blocked:`, err.message);
                // Show a toast so user knows to interact to enable sound
                toast(`🔇 Tap anywhere to enable ${label}`, {
                    duration: 3000,
                    id: `audio-unlock-${label}`,
                });
                // One-time click listener to retry audio
                const unlockAudio = () => {
                    audio.play().catch(() => {});
                    document.removeEventListener('click', unlockAudio);
                    document.removeEventListener('touchstart', unlockAudio);
                };
                document.addEventListener('click', unlockAudio, { once: true });
                document.addEventListener('touchstart', unlockAudio, { once: true });
            });
        }
    }, []);

    // Handle audio playback based on status
    useEffect(() => {
        const stopAll = () => {
            dialToneRef.current?.pause();
            if (dialToneRef.current) dialToneRef.current.currentTime = 0;
            incomingRingtoneRef.current?.pause();
            if (incomingRingtoneRef.current) incomingRingtoneRef.current.currentTime = 0;
        };

        if (callState.status === 'calling') {
            // I am the CALLER — play calm dial tone
            stopAll();
            playAudio(dialToneRef.current, 'dial tone');
        } else if (callState.status === 'incoming') {
            // I am the CALLEE — play attention-grabbing ringtone
            stopAll();
            playAudio(incomingRingtoneRef.current, 'ringtone');
        } else {
            stopAll();
        }
    }, [callState.status, playAudio]);

    // ─── Cleanup ─────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (mediaConnectionRef.current) { mediaConnectionRef.current.close(); mediaConnectionRef.current = null; }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        
        // Stop audio
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

    // ─── PeerJS initialization ───────────────────────────────────
    useEffect(() => {
        if (!user?.id) return;
        if (peerRef.current) return;

        let destroyed = false;
        const MAX_RECONNECT = 3;

        function createPeer(suffix?: string) {
            if (destroyed) return;

            const peerId = makePeerId(user!.id, suffix || Math.random().toString(36).substring(7));
            let reconnectAttempts = 0;

            const peerConfig = import.meta.env.DEV 
                ? { host: 'localhost', port: 9000, path: '/peerjs', secure: false }
                : {}; 

            const peer = new Peer(peerId, {
                ...peerConfig,
                debug: import.meta.env.DEV ? 2 : 0,
                pingInterval: 3000, // Heartbeat every 3s to keep signaling alive
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        // TURN servers for NAT traversal (ensures calls work behind firewalls)
                        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
                    ],
                },
            });

            peer.on('open', (id) => {
                console.log('[PeerJS] ✓ Connected:', id);
                reconnectAttempts = 0;
            });

            peer.on('call', (call) => {
                mediaConnectionRef.current = call;
                call.on('stream', (remote) => { 
                    setRemoteStream(remote); 
                    setCallState(p => ({ ...p, status: 'connected', connectedAt: p.connectedAt || Date.now() })); 
                });
                call.on('close', cleanup);
                call.on('error', () => { toast.error('Call error'); cleanup(); });
            });

            peer.on('error', (err: any) => {
                if (err.type === 'unavailable-id') {
                    console.warn('[PeerJS] ID taken — retrying…');
                    if (peerRef.current && !peerRef.current.destroyed) {
                        peerRef.current.destroy();
                    }
                    peerRef.current = null;
                    setTimeout(() => createPeer(Date.now().toString(36)), 800);
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
            setCallState({ type, status: 'calling', otherUser: otherUserId, otherUserName: name, otherUserAvatar: avatar, conversationId, connectedAt: null });

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { 
                    echoCancellation: true, 
                    noiseSuppression: true, 
                    autoGainControl: true,
                    // Advanced constraints (supported in Chromium)
                    // @ts-ignore
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true,
                    googAudioMirroring: false,
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false,
            });
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
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { 
                    echoCancellation: true, 
                    noiseSuppression: true, 
                    autoGainControl: true,
                    // @ts-ignore
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true,
                    googAudioMirroring: false,
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false,
            });
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
                connectedAt: null,
            });
        };

        const onReady = (data: any) => {
            if (currentCallStatus.current === 'calling' && peerRef.current && localStreamRef.current) {
                if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
                const calleePeerId = data.peerId || makePeerId(data.from);
                const call = peerRef.current.call(calleePeerId, localStreamRef.current, {
                    // Set bandwidth to ensure high quality audio
                    // @ts-ignore
                    sdpTransform: (sdp: string) => {
                        // 1. Lower Application Specific (AS) bandwidth to prevent jitter
                        // Using 2000 (2Mbps) for video, and remove for voice
                        let newSdp = sdp;
                        if (callState.type === 'video') {
                            newSdp = sdp.replace(/AS:([0-9]+)/g, 'AS:2000');
                        } else {
                            newSdp = sdp.replace(/b=AS:([0-9]+).*\r\n/g, '');
                        }

                        // 2. Optimize OPUS audio quality (payload type 111)
                        // This adds stereo support and boosts the bit rate for high fidelity
                        if (newSdp.includes('a=fmtp:111')) {
                            newSdp = newSdp.replace(
                                /a=fmtp:111 .*/,
                                'a=fmtp:111 minptime=10;stereo=1;useinbandfec=1;maxaveragebitrate=128000;sprop-stereo=1'
                            );
                        }
                        
                        return newSdp;
                    }
                });
                if (!call) { toast.error('Failed to connect'); cleanup(); return; }

                mediaConnectionRef.current = call;
                setCallState(p => ({ ...p, status: 'connecting' }));
                call.on('stream', (remote) => { 
                    setRemoteStream(remote); 
                    setCallState(p => ({ ...p, status: 'connected', connectedAt: p.connectedAt || Date.now() })); 
                });
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
