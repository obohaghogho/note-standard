import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
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
    if (!context) throw new Error('useWebRTC must be used within a WebRTCProvider');
    return context;
};

// Use STUN+TURN fallback per strict instructions
const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
];

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { sendMessageToConversation } = useChat();

    const [callState, setCallState] = useState<CallState>({
        type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null,
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentCallStatus = useRef<CallState['status']>('idle');
    const incomingSignalQueue = useRef<unknown[]>([]);

    const dialToneRef = useRef<HTMLAudioElement | null>(null);
    const incomingRingtoneRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Use a cache-buster to prevent net::ERR_CACHE_OPERATION_NOT_SUPPORTED
        // which often happens in Chrome with .wav files and Service Workers.
        const cb = `?cb=${Date.now()}`;
        dialToneRef.current = new Audio(`/sounds/ringtone.wav${cb}`);
        dialToneRef.current.loop = true;
        dialToneRef.current.volume = 0.5;
        incomingRingtoneRef.current = new Audio(`/sounds/ringing.wav${cb}`);
        incomingRingtoneRef.current.loop = true;
        incomingRingtoneRef.current.volume = 0.8;

        return () => {
            if (dialToneRef.current) { dialToneRef.current.pause(); dialToneRef.current = null; }
            if (incomingRingtoneRef.current) { incomingRingtoneRef.current.pause(); incomingRingtoneRef.current = null; }
        };
    }, []);

    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);

    const playAudio = useCallback((audio: HTMLAudioElement | null) => {
        if (!audio) return;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch((err) => console.log('Audio blocked:', err));
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
            playAudio(dialToneRef.current);
        } else if (callState.status === 'incoming') {
            stopAll();
            playAudio(incomingRingtoneRef.current);
        } else {
            stopAll();
        }
    }, [callState.status, playAudio]);

    const optimizeSDP = (sdp: string) => {
        return sdp.split('\r\n').map(line => {
            if (line.includes('a=fmtp:111')) {
                // Force mono (stereo=0) and enable DTX (usedtx=1) for noise suppression during silence
                let newLine = line;
                if (!line.includes('usedtx=1')) newLine += ';usedtx=1';
                if (!line.includes('stereo=0')) newLine += ';stereo=0';
                return newLine;
            }
            return line;
        }).join('\r\n');
    };

    const cleanup = useCallback(() => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        incomingSignalQueue.current = [];
        
        dialToneRef.current?.pause();
        incomingRingtoneRef.current?.pause();

        setLocalStream(null);
        setRemoteStream(null);
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
    }, []);

    const createPeerConnection = useCallback((targetUserId: string) => {
        const pc = new RTCPeerConnection({ 
            iceServers,
            iceCandidatePoolSize: 10
        });

        pc.onicecandidate = (e) => {
            if (e.candidate && socket) {
                socket.emit('call:signal', { 
                    to: targetUserId, 
                    signal: { candidate: e.candidate } 
                });
            }
        };

        // RULE 8: Track reception mapped strictly to avoid flickering
        pc.ontrack = (event) => {
            console.log('[WebRTC] Received remote track', event.streams[0]);
            remoteStreamRef.current = event.streams[0];
            setRemoteStream(event.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection State:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                cleanup();
            }
            if (pc.connectionState === 'connected') {
                setCallState(p => ({ ...p, status: 'connected', connectedAt: p.connectedAt || Date.now() }));
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE Connection State:', pc.iceConnectionState);
        };

        pcRef.current = pc;
        return pc;
    }, [socket, cleanup]);

    const flushSignalQueue = async (pc: RTCPeerConnection) => {
        while (incomingSignalQueue.current.length > 0) {
            const signal = incomingSignalQueue.current.shift();
            if (signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.error('ICE Add err', e));
            }
        }
    };

    const startCall = async (targetUserId: string, conversationId: string, type: 'voice' | 'video', otherUser: CallState['otherUser']) => {
        setCallState({ type, status: 'calling', otherUser, conversationId, connectedAt: null });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: { ideal: true },
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 48000 },
                    latency: { ideal: 0 }
                },
                video: type === 'video' ? { facingMode: "user" } : false,
            });

            localStreamRef.current = stream;
            setLocalStream(stream);

            // Signal ring instantly without wait for peer media
            socket?.emit('call:initiate', { to: targetUserId, type, conversationId });
            sendMessageToConversation(conversationId, `Started a ${type} call`, 'call');

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    socket?.emit('call:timeout', { to: targetUserId });
                    cleanup();
                }
            }, 60000);

        } catch (err) {
            console.error('[WebRTC] Camera Error:', err);
            cleanup();
        }
    };

    const acceptCall = async () => {
        const targetUserId = callState.otherUser?.id;
        if (!targetUserId) return cleanup();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: { ideal: true },
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 48000 },
                    latency: { ideal: 0 }
                },
                video: callState.type === 'video' ? { facingMode: "user" } : false,
            });

            localStreamRef.current = stream;
            setLocalStream(stream);

            socket?.emit('call:ready', { to: targetUserId });

            setCallState(p => ({ ...p, status: 'connected', connectedAt: Date.now() }));

        } catch (err) {
            console.error('[WebRTC] Accept Error:', err);
            cleanup();
        }
    };

    const rejectCall = () => {
        socket?.emit('call:reject', { to: callState.otherUser?.id });
        cleanup();
    };

    const endCall = () => {
        socket?.emit('call:end', { to: callState.otherUser?.id, conversationId: callState.conversationId });
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

        const handleCallIncoming = (data: { from: string; fromName?: string; fromAvatar?: string; type?: 'voice' | 'video'; conversationId: string }) => {
            if (currentCallStatus.current !== 'idle') {
                socket.emit('call:reject', { to: data.from });
                return;
            }
            setCallState({
                type: data.type || 'voice',
                status: 'incoming',
                otherUser: { id: data.from, full_name: data.fromName || 'Unknown User', avatar_url: data.fromAvatar },
                conversationId: data.conversationId,
                connectedAt: null,
            });
        };

        const handleCallReady = async (data: { from: string }) => {
            // Caller side: Receiver said ready, let's create Offer
            if (currentCallStatus.current !== 'calling') return;
            const targetUserId = data.from;
            
            try {
                // RULE: Media was ALREADY fetched in startCall
                const stream = localStreamRef.current;
                if (!stream) throw new Error("Local stream not found before offer");

                const pc = createPeerConnection(targetUserId);
                
                // RULE: ADD TRACKS BEFORE OFFER
                stream.getTracks().forEach(track => pc.addTrack(track, stream));

                const offer = await pc.createOffer();
                // Optimize SDP for iOS (Force Mono, Enable DTX for noise suppression)
                const optimizedOffer = {
                    ...offer,
                    sdp: optimizeSDP(offer.sdp || '')
                };
                await pc.setLocalDescription(optimizedOffer);

                socket.emit('call:signal', { to: targetUserId, signal: { offer: optimizedOffer } });
                setCallState(p => ({ ...p, status: 'connected', connectedAt: Date.now() }));
                
            } catch (err) {
                console.error('[WebRTC] Caller Media/Offer Error', err);
                socket.emit('call:end', { to: targetUserId });
                cleanup();
            }
        };

        const handleCallSignal = async (data: { from: string; signal: { offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
            let pc = pcRef.current;
            const { signal } = data;

            try {
                if (signal.offer) {
                    if (!pc) {
                         // Receiver side initializing PC on incoming offer
                         pc = createPeerConnection(data.from);
                         const stream = localStreamRef.current;
                         if (stream) {
                             // RULE: ADD TRACKS BEFORE OFFER OR ANSWER, NEVER RE-ADD
                             stream.getTracks().forEach(track => pc!.addTrack(track, stream));
                         }
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
                    const answer = await pc.createAnswer();
                    // Optimize SDP for iOS
                    const optimizedAnswer = {
                        ...answer,
                        sdp: optimizeSDP(answer.sdp || '')
                    };
                    await pc.setLocalDescription(optimizedAnswer);
                    socket.emit('call:signal', { to: data.from, signal: { answer: optimizedAnswer } });
                    flushSignalQueue(pc);
                } else if (signal.answer) {
                    if (pc) {
                        await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
                        flushSignalQueue(pc);
                    }
                } else if (signal.candidate) {
                    if (!pc) {
                        incomingSignalQueue.current.push(signal);
                        return;
                    }
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            } catch (err) {
                console.error('[WebRTC] Signal handling error', err);
            }
        };

        socket.on('call:incoming', handleCallIncoming);
        socket.on('call:ready', handleCallReady);
        socket.on('call:signal', handleCallSignal);
        socket.on('call:rejected', cleanup);
        socket.on('call:ended', cleanup);
        socket.on('call:timeout', cleanup);

        return () => {
            socket.off('call:incoming', handleCallIncoming);
            socket.off('call:ready', handleCallReady);
            socket.off('call:signal', handleCallSignal);
            socket.off('call:rejected', cleanup);
            socket.off('call:ended', cleanup);
            socket.off('call:timeout', cleanup);
        };
    }, [socket, socketConnected, cleanup, callState.type, createPeerConnection]);

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
                        status: callState.status as 'calling' | 'incoming' | 'connected',
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
