import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useChat } from './ChatContext';
import toast from 'react-hot-toast';
import { CallOverlay } from '../components/chat/CallOverlay';
import AgoraRTC, { IAgoraRTCClient, ILocalVideoTrack, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import axios from 'axios';

interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';
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

// STUN + TURN fallback for NAT traversal
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

const AGORA_APP_ID = "652459c783604367857bc602fc8faae5";

/**
 * BUG FIX — iOS Audio Noise:
 * iOS Safari ignores the `{ ideal: ... }` constraint format for basic boolean audio
 * properties (echoCancellation, noiseSuppression, autoGainControl). When these are
 * passed as objects, iOS falls back to its default stereo video-audio session which
 * causes the noisy background audio. Using plain boolean values forces iOS to apply
 * the constraints correctly and use the voice-call audio processing pipeline.
 */
const isIOSDevice = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const getAudioConstraints = (): MediaTrackConstraints => {
    if (isIOSDevice()) {
        // iOS: use plain booleans for noise/echo properties.
        // Using { exact: true } or { ideal: ... } can sometimes bypass hardware AEC on Safari.
        return {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // @ts-expect-error: latency is a non-standard constraint for WebRTC
            latency: 0,
            sampleRate: 48000,
            channelCount: 1,
            // @ts-expect-error: voiceActivityDetection is a non-standard constraint
            voiceActivityDetection: true
        };
    }
    
    // Desktop/Android: robust constraints for noise and echo reduction
    return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // @ts-expect-error: latency is non-standard
        latency: 0,
        // Chromium-specific aggressive processing
        // @ts-expect-error: googEchoCancellation is a Chromium-only legacy constraint
        googEchoCancellation: true,
        // @ts-expect-error: googAutoGainControl is a Chromium-only legacy constraint
        googAutoGainControl: true,
        // @ts-expect-error: googNoiseSuppression is a Chromium-only legacy constraint
        googNoiseSuppression: true,
        // @ts-expect-error: googHighpassFilter is a Chromium-only legacy constraint
        googHighpassFilter: true,
        // @ts-expect-error: googTypingNoiseDetection is a Chromium-only legacy constraint
        googTypingNoiseDetection: true,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 }
    };
};

const getVideoConstraints = (): MediaTrackConstraints => ({
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
});

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
    // Stable ref for otherUser so socket handlers can read it without stale closure
    const otherUserRef = useRef<CallState['otherUser']>(null);
    const incomingSignalQueue = useRef<{ candidate?: RTCIceCandidateInit }[]>([]);

    // Agora Refs
    const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
    const localVideoTrackRef = useRef<ILocalVideoTrack | null>(null);
    const isUsingAgora = useRef<boolean>(false);

    const dialToneRef = useRef<HTMLAudioElement | null>(null);
    const incomingRingtoneRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const cb = `?cb=${Date.now()}`;
        dialToneRef.current = new Audio(`/sounds/ringtone.wav${cb}`);
        dialToneRef.current.loop = true;
        dialToneRef.current.volume = 0.5;
        incomingRingtoneRef.current = new Audio(`/sounds/ringing.wav${cb}`);
        incomingRingtoneRef.current.loop = true;
        incomingRingtoneRef.current.volume = 0.8;

        // BUG FIX — iOS Ringtones:
        // Unlock audio elements on first user interaction to satisfy iOS autoplay policy.
        const unlock = () => {
            if (dialToneRef.current) {
                dialToneRef.current.play().then(() => dialToneRef.current?.pause()).catch(() => {});
            }
            if (incomingRingtoneRef.current) {
                incomingRingtoneRef.current.play().then(() => incomingRingtoneRef.current?.pause()).catch(() => {});
            }
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);

        return () => {
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            if (dialToneRef.current) { dialToneRef.current.pause(); dialToneRef.current = null; }
            if (incomingRingtoneRef.current) { incomingRingtoneRef.current.pause(); incomingRingtoneRef.current = null; }
        };
    }, []);

    // Keep refs in sync with state
    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);
    useEffect(() => { otherUserRef.current = callState.otherUser; }, [callState.otherUser]);

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
                let newLine = line;
                // Force mono and high-quality voice parameters for Opus
                if (!line.includes('usedtx=1')) newLine += ';usedtx=1';
                if (!line.includes('stereo=0')) newLine += ';stereo=0';
                if (!line.includes('sprop-stereo=0')) newLine += ';sprop-stereo=0';
                if (!line.includes('useinbandfec=1')) newLine += ';useinbandfec=1';
                if (!line.includes('cbr=0')) newLine += ';cbr=0';
                if (!line.includes('minptime=10')) newLine += ';minptime=10';
                if (!line.includes('maxaveragebitrate=40000')) newLine += ';maxaveragebitrate=40000';
                return newLine;
            }
            return line;
        }).join('\r\n');
    };

    const cleanup = useCallback(async () => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        
        // Cleanup standard WebRTC
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }

        // Cleanup Agora
        if (agoraClientRef.current) {
            try {
                localAudioTrackRef.current?.stop();
                localAudioTrackRef.current?.close();
                localVideoTrackRef.current?.stop();
                localVideoTrackRef.current?.close();
                await agoraClientRef.current.leave();
            } catch (err) {
                console.error('[Agora] Cleanup error:', err);
            }
            agoraClientRef.current = null;
            localAudioTrackRef.current = null;
            localVideoTrackRef.current = null;
        }
        isUsingAgora.current = false;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        // FIX: also clear remote stream ref to prevent stale stream reference
        remoteStreamRef.current = null;
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

        pc.ontrack = (event) => {
            console.log('[WebRTC] Received remote track', event.track.kind);
            if (event.streams && event.streams[0]) {
                remoteStreamRef.current = event.streams[0];
                setRemoteStream(event.streams[0]);
            } else {
                // Fallback: If no stream is provided, create one or use existing
                const stream = remoteStreamRef.current || new MediaStream();
                stream.addTrack(event.track);
                remoteStreamRef.current = stream;
                setRemoteStream(stream);
            }
            
            // Force a state update to ensure UI re-renders if a new track arrives 
            // but the MediaStream reference is the same (e.g., audio then video)
            setCallState(prev => ({ ...prev }));
        };

        pc.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection State:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                cleanup();
            }
            // FIX: 'connected' state is ONLY set here — after ICE negotiation completes
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

    // FIX: typed signal queue items
    const flushSignalQueue = async (pc: RTCPeerConnection) => {
        while (incomingSignalQueue.current.length > 0) {
            const signal = incomingSignalQueue.current.shift();
            if (signal?.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.error('ICE Add err', e));
            }
        }
    };

    const fetchAgoraToken = async (channel: string) => {
        try {
            const response = await axios.get(`/api/agora?channel=${channel}`);
            return response.data.token;
        } catch (err) {
            console.error('[Agora] Token fetch failed:', err);
            throw err;
        }
    };

    const initAgoraCall = async (conversationId: string, type: 'voice' | 'video') => {
        console.log('[Agora] Initializing Agora Call...');
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "h264" });
        agoraClientRef.current = client;
        isUsingAgora.current = true;

        const token = await fetchAgoraToken(conversationId);
        await client.join(AGORA_APP_ID, conversationId, token, null);

        // Create local tracks
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            AEC: true, ANS: true, AGC: true
        });
        localAudioTrackRef.current = audioTrack;

        let videoTrack: ILocalVideoTrack | null = null;
        if (type === 'video') {
            videoTrack = await AgoraRTC.createCameraVideoTrack();
            localVideoTrackRef.current = videoTrack;
        }

        // Sync with existing MediaStream state for UI compatibility
        const localStream = new MediaStream();
        localStream.addTrack(audioTrack.getMediaStreamTrack());
        if (videoTrack) localStream.addTrack(videoTrack.getMediaStreamTrack());
        localStreamRef.current = localStream;
        setLocalStream(localStream);

        // Publish tracks
        await client.publish(videoTrack ? [audioTrack, videoTrack] : [audioTrack]);

        // Handle remote tracks
        client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            console.log("[Agora] Subscribed to remote user:", user.uid, mediaType);

            if (mediaType === "video") {
                const remoteVideoTrack = user.videoTrack;
                const remoteAudioTrack = user.audioTrack;
                
                const remoteStream = remoteStreamRef.current || new MediaStream();
                if (remoteVideoTrack) remoteStream.addTrack(remoteVideoTrack.getMediaStreamTrack());
                if (remoteAudioTrack) remoteStream.addTrack(remoteAudioTrack.getMediaStreamTrack());
                
                remoteStreamRef.current = remoteStream;
                setRemoteStream(remoteStream);
            }

            if (mediaType === "audio") {
                const remoteAudioTrack = user.audioTrack;
                const remoteStream = remoteStreamRef.current || new MediaStream();
                if (remoteAudioTrack) remoteStream.addTrack(remoteAudioTrack.getMediaStreamTrack());
                
                remoteStreamRef.current = remoteStream;
                setRemoteStream(remoteStream);
            }
            
            setCallState(p => ({ ...p, status: 'connected', connectedAt: p.connectedAt || Date.now() }));
        });

        client.on("user-unpublished", (user) => {
            console.log("[Agora] User unpublished:", user.uid);
            // In a 1-to-1 call, this usually means the call ended
            cleanup();
        });
    };

    const startCall = async (targetUserId: string, conversationId: string, type: 'voice' | 'video', otherUser: CallState['otherUser']) => {
        setCallState({ type, status: 'calling', otherUser, conversationId, connectedAt: null });

        // TRY AGORA FIRST (Highly recommended for iOS)
        try {
            await initAgoraCall(conversationId, type);
            socket?.emit('call:initiate', { to: targetUserId, type, conversationId, useAgora: true });
            sendMessageToConversation(conversationId, `Started a ${type} call`, 'call');

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    socket?.emit('call:timeout', { to: targetUserId });
                    cleanup();
                }
            }, 60000);
            return;
        } catch (agoraErr) {
            console.warn('[WebRTC] Agora failed or free tier over, falling back to standard WebRTC:', agoraErr);
            // Fallback to standard WebRTC implementation
            isUsingAgora.current = false;
        }

        try {
            // Standard WebRTC Implementation
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(),
                video: type === 'video' ? getVideoConstraints() : false,
            });

            localStreamRef.current = stream;
            setLocalStream(stream);

            socket?.emit('call:initiate', { to: targetUserId, type, conversationId, useAgora: false });
            sendMessageToConversation(conversationId, `Started a ${type} call`, 'call');

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    socket?.emit('call:timeout', { to: targetUserId });
                    cleanup();
                }
            }, 60000);

        } catch (err) {
            console.error('[WebRTC] Camera/Mic Error:', err);
            toast.error('Could not access camera/microphone. Check permissions.');
            cleanup();
        }
    };

    const acceptCall = async () => {
        const targetUserId = callState.otherUser?.id;
        const conversationId = callState.conversationId;
        if (!targetUserId || !conversationId) return cleanup();

        // Check if the caller is using Agora (this would be sent in the incoming signal, but here we prioritize it anyway)
        // If it's iOS, we DEFINITELY want Agora if possible.
        try {
            await initAgoraCall(conversationId, callState.type || 'voice');
            socket?.emit('call:ready', { to: targetUserId, useAgora: true });
            setCallState(p => ({ ...p, status: 'connecting' }));
            return;
        } catch (agoraErr) {
            console.warn('[WebRTC] Agora Accept failed, falling back to standard WebRTC:', agoraErr);
            isUsingAgora.current = false;
        }

        try {
            // Standard WebRTC Fallback
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(),
                video: callState.type === 'video' ? getVideoConstraints() : false,
            });

            localStreamRef.current = stream;
            setLocalStream(stream);

            socket?.emit('call:ready', { to: targetUserId, useAgora: false });

            // FIX: Set 'connecting' (not 'connected') — actual 'connected' fires via
            // pc.onconnectionstatechange once ICE negotiation completes
            setCallState(p => ({ ...p, status: 'connecting' }));

        } catch (err) {
            console.error('[WebRTC] Accept Error:', err);
            toast.error('Could not access camera/microphone. Check permissions.');
            cleanup();
        }
    };

    const rejectCall = () => {
        socket?.emit('call:reject', { to: callState.otherUser?.id });
        cleanup();
    };

    const endCall = () => {
        if (callState.otherUser?.id) {
            socket?.emit('call:end', { to: callState.otherUser.id, conversationId: callState.conversationId });
        }
        cleanup();
    };

    const toggleMute = () => {
        if (isUsingAgora.current && localAudioTrackRef.current) {
            const nextMute = !isMuted;
            localAudioTrackRef.current.setEnabled(!nextMute);
            setIsMuted(nextMute);
            return;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = isMuted);
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (isUsingAgora.current && localVideoTrackRef.current) {
            const nextVideo = !isVideoEnabled;
            localVideoTrackRef.current.setEnabled(nextVideo);
            setIsVideoEnabled(nextVideo);
            return;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !isVideoEnabled);
            setIsVideoEnabled(!isVideoEnabled);
        }
    };

    useEffect(() => {
        if (!socket || !socketConnected) return;

        const handleCallIncoming = (data: { from: string; fromName?: string; fromAvatar?: string; type?: 'voice' | 'video'; conversationId: string; useAgora?: boolean }) => {
            if (currentCallStatus.current !== 'idle') {
                socket.emit('call:reject', { to: data.from });
                return;
            }
            // If caller says they are using Agora, we should prepare for it.
            // But our acceptCall logic already prioritizes it.
            setCallState({
                type: data.type || 'voice',
                status: 'incoming',
                otherUser: { id: data.from, full_name: data.fromName || 'Unknown User', avatar_url: data.fromAvatar },
                conversationId: data.conversationId,
                connectedAt: null,
            });
        };

        const handleCallReady = async (data: { from: string; useAgora?: boolean }) => {
            // Caller side: receiver said ready → create and send the offer (if not using Agora)
            if (currentCallStatus.current !== 'calling') return;
            const targetUserId = data.from;

            if (isUsingAgora.current || data.useAgora) {
                console.log('[Agora] Receiver is ready, Agora session active.');
                // No need for WebRTC signaling here, Agora handles it.
                return;
            }
            
            try {
                const stream = localStreamRef.current;
                if (!stream) throw new Error('Local stream not found before offer');

                const pc = createPeerConnection(targetUserId);
                stream.getTracks().forEach(track => pc.addTrack(track, stream));

                const offer = await pc.createOffer();
                const optimizedOffer = { ...offer, sdp: optimizeSDP(offer.sdp || '') };
                await pc.setLocalDescription(optimizedOffer);

                socket.emit('call:signal', { to: targetUserId, signal: { offer: optimizedOffer } });

                // FIX: Set 'connecting' here — 'connected' fires via onconnectionstatechange
                setCallState(p => ({ ...p, status: 'connecting' }));
                
            } catch (err) {
                console.error('[WebRTC] Caller Offer Error', err);
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
                        pc = createPeerConnection(data.from);
                        const stream = localStreamRef.current;
                        if (stream) {
                            stream.getTracks().forEach(track => pc!.addTrack(track, stream));
                        }
                    }
                    const optimizedOffer = { 
                        type: signal.offer.type, 
                        sdp: optimizeSDP(signal.offer.sdp || '') 
                    } as RTCSessionDescriptionInit;
                    await pc.setRemoteDescription(new RTCSessionDescription(optimizedOffer));
                    const answer = await pc.createAnswer();
                    const optimizedAnswer = { 
                        type: answer.type, 
                        sdp: optimizeSDP(answer.sdp || '') 
                    } as RTCSessionDescriptionInit;
                    await pc.setLocalDescription(optimizedAnswer);
                    socket.emit('call:signal', { to: data.from, signal: { answer: optimizedAnswer } });
                    await flushSignalQueue(pc);
                } else if (signal.answer) {
                    if (pc) {
                        const optimizedAnswer = { 
                            type: signal.answer.type, 
                            sdp: optimizeSDP(signal.answer.sdp || '') 
                        } as RTCSessionDescriptionInit;
                        await pc.setRemoteDescription(new RTCSessionDescription(optimizedAnswer));
                        await flushSignalQueue(pc);
                    }
                } else if (signal.candidate) {
                    if (!pc) {
                        incomingSignalQueue.current.push({ candidate: signal.candidate });
                        return;
                    }
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            } catch (err) {
                console.error('[WebRTC] Signal handling error', err);
            }
        };

        // FIX: Show missed-call toast when caller hangs up/times out while we're ringing
        const handleCallEndedOrTimeout = () => {
            if (currentCallStatus.current === 'incoming') {
                const name = otherUserRef.current?.full_name || 'Unknown';
                toast(`📞 Missed call from ${name}`, { duration: 5000 });
            }
            cleanup();
        };

        socket.on('call:incoming', handleCallIncoming);
        socket.on('call:ready', handleCallReady);
        socket.on('call:signal', handleCallSignal);
        socket.on('call:rejected', cleanup);
        socket.on('call:ended', handleCallEndedOrTimeout);
        socket.on('call:timeout', handleCallEndedOrTimeout);

        return () => {
            socket.off('call:incoming', handleCallIncoming);
            socket.off('call:ready', handleCallReady);
            socket.off('call:signal', handleCallSignal);
            socket.off('call:rejected', cleanup);
            socket.off('call:ended', handleCallEndedOrTimeout);
            socket.off('call:timeout', handleCallEndedOrTimeout);
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
                        status: callState.status as 'calling' | 'incoming' | 'connecting' | 'connected',
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
