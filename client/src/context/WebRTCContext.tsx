import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useChat } from './ChatContext';
import toast from 'react-hot-toast';
import { CallOverlay } from '../components/chat/CallOverlay';
import api from '../api/axiosInstance';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting';
    otherUser: { id: string; full_name: string; avatar_url?: string } | null;
    conversationId: string | null;
    connectedAt: number | null;
    sessionId: string | null; // FIX #4: track sessionId throughout call lifecycle
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
    const ctx = useContext(WebRTCContext);
    if (!ctx) throw new Error('useWebRTC must be used within WebRTCProvider');
    return ctx;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const FALLBACK_ICE: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

const isIOS = (): boolean =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// FIX #8: Remove non-standard `latency:0` that causes OverconstrainedError on iOS Safari
const getAudioConstraints = (): MediaTrackConstraints => {
    if (isIOS()) {
        return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 };
    }
    return {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        // @ts-expect-error Chromium-only hints
        googEchoCancellation: true, googAutoGainControl: true, googNoiseSuppression: true,
        googHighpassFilter: true, googTypingNoiseDetection: true,
        channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
    };
};

const getVideoConstraints = (): MediaTrackConstraints => ({
    facingMode: 'user', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 24, max: 30 },
});

const optimizeSDP = (sdp: string): string =>
    sdp.split('\r\n').map(line => {
        if (line.includes('a=fmtp:111')) {
            if (!line.includes('usedtx=1'))               line += ';usedtx=1';
            if (!line.includes('stereo=0'))               line += ';stereo=0';
            if (!line.includes('sprop-stereo=0'))         line += ';sprop-stereo=0';
            if (!line.includes('useinbandfec=1'))         line += ';useinbandfec=1';
            if (!line.includes('minptime=10'))            line += ';minptime=10';
            if (!line.includes('maxaveragebitrate=40000')) line += ';maxaveragebitrate=40000';
        }
        return line;
    }).join('\r\n');

// ── Provider ──────────────────────────────────────────────────────────────────
export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { sendMessageToConversation } = useChat();

    const [callState, setCallState] = useState<CallState>({
        type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null, sessionId: null,
    });
    const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted]           = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    // Stable refs — no stale-closure issues
    const pcRef              = useRef<RTCPeerConnection | null>(null);
    const localStreamRef     = useRef<MediaStream | null>(null);
    const remoteStreamRef    = useRef<MediaStream | null>(null);
    const callTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentStatus      = useRef<CallState['status']>('idle');
    const otherUserRef       = useRef<CallState['otherUser']>(null);
    const sessionIdRef       = useRef<string | null>(null);
    const targetUserIdRef    = useRef<string | null>(null);
    const callTypeRef        = useRef<'voice' | 'video' | null>(null);
    const conversationIdRef  = useRef<string | null>(null);
    // FIX #3: Queue ICE candidates until remoteDescription is set
    const iceCandidateQueue  = useRef<RTCIceCandidateInit[]>([]);
    const isCleaningUp       = useRef(false);
    const fetchedIceServers  = useRef<RTCIceServer[] | null>(null);
    const dialToneRef        = useRef<HTMLAudioElement | null>(null);
    const ringtoneRef        = useRef<HTMLAudioElement | null>(null);

    // Keep refs in sync with state
    useEffect(() => { currentStatus.current    = callState.status; },         [callState.status]);
    useEffect(() => { otherUserRef.current      = callState.otherUser; },      [callState.otherUser]);
    useEffect(() => { sessionIdRef.current      = callState.sessionId; },      [callState.sessionId]);
    useEffect(() => { callTypeRef.current       = callState.type; },           [callState.type]);
    useEffect(() => { conversationIdRef.current = callState.conversationId; }, [callState.conversationId]);

    // ── Audio unlock for iOS autoplay policy ──────────────────────────────────
    useEffect(() => {
        const cb = `?cb=${Date.now()}`;
        dialToneRef.current = new Audio(`/sounds/ringtone.wav${cb}`);
        dialToneRef.current.loop = true; dialToneRef.current.volume = 0.5;
        ringtoneRef.current = new Audio(`/sounds/ringing.wav${cb}`);
        ringtoneRef.current.loop = true; ringtoneRef.current.volume = 0.8;

        const unlock = () => {
            dialToneRef.current?.play().then(() => dialToneRef.current?.pause()).catch(() => {});
            ringtoneRef.current?.play().then(() => ringtoneRef.current?.pause()).catch(() => {});
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
        return () => {
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            dialToneRef.current?.pause();
            ringtoneRef.current?.pause();
        };
    }, []);

    const stopAllAudio = useCallback(() => {
        if (dialToneRef.current) { dialToneRef.current.pause(); dialToneRef.current.currentTime = 0; }
        if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
    }, []);

    useEffect(() => {
        const s = callState.status;
        stopAllAudio();
        if (s === 'calling' || s === 'ringing') dialToneRef.current?.play().catch(() => {});
        if (s === 'incoming')                   ringtoneRef.current?.play().catch(() => {});
    }, [callState.status, stopAllAudio]);

    // ── ICE server fetch ──────────────────────────────────────────────────────
    const ensureIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
        if (fetchedIceServers.current) return fetchedIceServers.current;
        try {
            const res = await api.get('/webrtc/ice-servers');
            if (res.data?.iceServers) {
                fetchedIceServers.current = res.data.iceServers;
                return res.data.iceServers;
            }
        } catch { /* fall through to STUN fallback */ }
        fetchedIceServers.current = FALLBACK_ICE;
        return FALLBACK_ICE;
    }, []);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (isCleaningUp.current) return;
        isCleaningUp.current = true;
        console.log('[WebRTC] cleanup() called from:', new Error().stack);

        if (callTimeoutRef.current)   { clearTimeout(callTimeoutRef.current);   callTimeoutRef.current = null; }
        if (reconnectTimerRef.current){ clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }

        if (pcRef.current) {
            pcRef.current.onicecandidate          = null;
            pcRef.current.ontrack                 = null;
            pcRef.current.onconnectionstatechange = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        remoteStreamRef.current   = null;
        iceCandidateQueue.current = [];
        targetUserIdRef.current   = null;
        sessionIdRef.current      = null;
        stopAllAudio();
        setLocalStream(null);
        setRemoteStream(null);
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null, sessionId: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
        setTimeout(() => { isCleaningUp.current = false; }, 300);
    }, [stopAllAudio]);

    // ── FIX #3: Drain queued ICE candidates once remote desc is set ───────────
    const drainIceQueue = useCallback(async (pc: RTCPeerConnection) => {
        if (!pc.remoteDescription) return;
        const queue = [...iceCandidateQueue.current];
        iceCandidateQueue.current = [];
        console.log(`[WebRTC] Draining ${queue.length} queued ICE candidates`);
        for (const c of queue) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { console.error('[WebRTC] queued ICE error:', e); }
        }
    }, []);

    // ── Create RTCPeerConnection ───────────────────────────────────────────────
    const createPeerConnection = useCallback((targetUserId: string): RTCPeerConnection => {
        if (pcRef.current) {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.close();
            pcRef.current = null;
        }

        const pc = new RTCPeerConnection({
            iceServers:          fetchedIceServers.current || FALLBACK_ICE,
            iceCandidatePoolSize: 10,
            bundlePolicy:        'max-bundle',
            rtcpMuxPolicy:       'require',
        });

        // FIX #1: Send ICE candidates via call:ice-candidate (not call:signal)
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                console.log(`[WebRTC Forensic] ICE Emission at ${Date.now()}:`, e.candidate.candidate);
            }
            if (e.candidate && socket) {
                console.log(`[WebRTC Forensic] Sending ICE candidate to remote at ${Date.now()}`);
                socket.emit('call:ice-candidate', {
                    to: targetUserId, candidate: e.candidate.toJSON(), sessionId: sessionIdRef.current,
                });
            }
        };

        pc.ontrack = (event) => {
            console.log('[WebRTC] Remote track:', event.track.kind);
            if (event.streams?.[0]) {
                remoteStreamRef.current = event.streams[0];
                setRemoteStream(new MediaStream(event.streams[0].getTracks()));
            } else {
                const s = remoteStreamRef.current || new MediaStream();
                s.addTrack(event.track);
                remoteStreamRef.current = s;
                setRemoteStream(new MediaStream(s.getTracks()));
            }
        };

        pc.onconnectionstatechange = async () => {
            const state = pc.connectionState;
            const iceState = pc.iceConnectionState;
            const sigState = pc.signalingState;
            console.log(`[WebRTC Forensic] Connection State Timeline -> Connection: ${state} | ICE: ${iceState} | Signaling: ${sigState}`);

            if (state === 'connected') {
                try {
                    const stats = await pc.getStats();
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                            console.log('[WebRTC Forensic] Selected candidate pair:', report);
                            const local = stats.get(report.localCandidateId);
                            const remote = stats.get(report.remoteCandidateId);
                            console.log('[WebRTC Forensic] Local candidate type:', local?.candidateType);
                            console.log('[WebRTC Forensic] Remote candidate type:', remote?.candidateType);
                        }
                    });
                } catch (err) {
                    console.warn('[WebRTC Forensic] Error getting stats', err);
                }

                if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
                setCallState(p => ({ ...p, status: 'connected', connectedAt: p.connectedAt || Date.now() }));
            }

            // FIX #11: `disconnected` is transient — attempt ICE restart with grace period
            if (state === 'disconnected') {
                console.log('[WebRTC] Disconnected — 8s grace before ICE restart');
                setCallState(p => ({ ...p, status: 'reconnecting' }));
                reconnectTimerRef.current = setTimeout(() => {
                    if (pcRef.current?.connectionState === 'disconnected') {
                        console.log('[WebRTC] Attempting ICE restart');
                        pcRef.current.restartIce();
                        reconnectTimerRef.current = setTimeout(() => {
                            if (pcRef.current?.connectionState !== 'connected') {
                                socket?.emit('call:end', { to: targetUserIdRef.current, sessionId: sessionIdRef.current, conversationId: conversationIdRef.current });
                                cleanup();
                            }
                        }, 10000);
                    }
                }, 8000);
            }

            if (state === 'failed') {
                console.log('[WebRTC] Connection failed — ICE restart');
                try { pcRef.current?.restartIce(); } catch { /* ignore */ }
                reconnectTimerRef.current = setTimeout(() => {
                    if (pcRef.current?.connectionState !== 'connected') {
                        socket?.emit('call:end', { to: targetUserIdRef.current, sessionId: sessionIdRef.current, conversationId: conversationIdRef.current });
                        cleanup();
                    }
                }, 8000);
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.connectionState;
            const iceState = pc.iceConnectionState;
            const sigState = pc.signalingState;
            console.log(`[WebRTC Forensic] Connection State Timeline -> Connection: ${state} | ICE: ${iceState} | Signaling: ${sigState}`);
        };
        
        pc.onsignalingstatechange = () => {
            const state = pc.connectionState;
            const iceState = pc.iceConnectionState;
            const sigState = pc.signalingState;
            console.log(`[WebRTC Forensic] Connection State Timeline -> Connection: ${state} | ICE: ${iceState} | Signaling: ${sigState}`);
        };
        
        pc.onicegatheringstatechange  = () => console.log('[WebRTC] iceGatheringState:', pc.iceGatheringState);

        pcRef.current = pc;
        return pc;
    }, [socket, cleanup]);

    // ── startCall (caller side) ───────────────────────────────────────────────
    const startCall = useCallback(async (
        targetUserId: string, conversationId: string, type: 'voice' | 'video', otherUser: CallState['otherUser'],
    ) => {
        if (currentStatus.current !== 'idle') return;
        targetUserIdRef.current = targetUserId;
        setCallState({ type, status: 'calling', otherUser, conversationId, connectedAt: null, sessionId: null });

        try {
            await ensureIceServers();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(), video: type === 'video' ? getVideoConstraints() : false,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            console.log('[WebRTC] Emitting call:initiate to gateway:', { to: targetUserId, type, callType: type, conversationId });
            socket?.emit('call:initiate', { to: targetUserId, type, callType: type, conversationId });
            sendMessageToConversation({ conversationId, content: `Started a ${type} call`, type: 'call' });

            callTimeoutRef.current = setTimeout(() => {
                if (currentStatus.current === 'calling' || currentStatus.current === 'ringing') {
                    toast.error('No answer');
                    socket?.emit('call:timeout', { to: targetUserId, sessionId: sessionIdRef.current });
                    cleanup();
                }
            }, 60000);
        } catch (err) {
            console.error('[WebRTC] startCall error:', err);
            toast.error('Could not access camera/microphone. Check permissions.');
            cleanup();
        }
    }, [socket, ensureIceServers, sendMessageToConversation, cleanup]);

    // ── acceptCall (callee side) ──────────────────────────────────────────────
    const acceptCall = useCallback(async () => {
        const { otherUser, type, sessionId } = callState;
        if (!otherUser?.id) { cleanup(); return; }
        targetUserIdRef.current = otherUser.id;

        try {
            await ensureIceServers();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(), video: type === 'video' ? getVideoConstraints() : false,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            // FIX #2: Emit call:answer — the event the server actually listens for
            socket?.emit('call:answer', { to: otherUser.id, sessionId });
            setCallState(p => ({ ...p, status: 'connecting' }));
        } catch (err) {
            console.error('[WebRTC] acceptCall error:', err);
            toast.error('Could not access camera/microphone. Check permissions.');
            cleanup();
        }
    }, [callState, socket, ensureIceServers, cleanup]);

    const rejectCall = useCallback(() => {
        socket?.emit('call:reject', { to: callState.otherUser?.id, sessionId: callState.sessionId });
        cleanup();
    }, [callState, socket, cleanup]);

    const endCall = useCallback(() => {
        if (callState.otherUser?.id) {
            socket?.emit('call:end', { to: callState.otherUser.id, sessionId: callState.sessionId, conversationId: callState.conversationId });
        }
        cleanup();
    }, [callState, socket, cleanup]);

    const toggleMute = useCallback(() => {
        if (!localStreamRef.current) return;
        const next = !isMuted;
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
        setIsMuted(next);
    }, [isMuted]);

    const toggleVideo = useCallback(() => {
        if (!localStreamRef.current) return;
        const next = !isVideoEnabled;
        localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = next; });
        setIsVideoEnabled(next);
    }, [isVideoEnabled]);

    // ── Socket event handlers ─────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !socketConnected) return;

        // Callee receives incoming call notification
        const onCallIncoming = (data: {
            from: string; fromName?: string; fromAvatar?: string;
            type?: 'voice' | 'video'; callType?: 'voice' | 'video';
            conversationId: string; sessionId?: string;
        }) => {
            console.log('[WebRTC] Received call:incoming event!', data);
            if (currentStatus.current !== 'idle') {
                console.log('[WebRTC] Auto-rejecting because status is not idle. Current status:', currentStatus.current);
                socket.emit('call:reject', { to: data.from, sessionId: data.sessionId });
                return;
            }
            const resolvedType = data.type || data.callType || 'voice';
            targetUserIdRef.current = data.from;
            sessionIdRef.current    = data.sessionId || null;
            setCallState({
                type: resolvedType, status: 'incoming',
                otherUser: { id: data.from, full_name: data.fromName || 'Unknown', avatar_url: data.fromAvatar },
                conversationId: data.conversationId, connectedAt: null, sessionId: data.sessionId || null,
            });
            socket.emit('call:ringing', { to: data.from });
        };

        // Caller learns callee's device is ringing
        const onCallRinging = () => {
            if (currentStatus.current === 'calling') setCallState(p => ({ ...p, status: 'ringing' }));
        };

        // FIX #2: Caller receives call:answered (server emits this after call:answer)
        // This replaces the broken call:ready flow — now creates PC and sends SDP offer
        const onCallAnswered = async (data: { from: string; sessionId?: string }) => {
            if (currentStatus.current !== 'calling' && currentStatus.current !== 'ringing') return;
            console.log('[WebRTC] Call answered by', data.from, '— creating offer');

            if (data.sessionId) {
                sessionIdRef.current = data.sessionId;
                setCallState(p => ({ ...p, sessionId: data.sessionId || null }));
            }

            const stream = localStreamRef.current;
            if (!stream) {
                console.error('[WebRTC] No local stream when offer needed');
                socket.emit('call:end', { to: data.from, sessionId: sessionIdRef.current });
                cleanup(); return;
            }

            try {
                const pc = createPeerConnection(data.from);
                // FIX #6: add tracks BEFORE createOffer
                stream.getTracks().forEach(t => pc.addTrack(t, stream));

                const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: callTypeRef.current === 'video',
                });
                const sdp = { type: offer.type, sdp: optimizeSDP(offer.sdp || '') } as RTCSessionDescriptionInit;
                if (pc.signalingState !== 'stable') {
                    console.error(`[WebRTC Forensic] Cannot set local offer, signalingState is ${pc.signalingState}`);
                    return;
                }
                await pc.setLocalDescription(sdp);
                console.log(`[WebRTC Forensic] LOCAL SDP (Offer) Set at ${Date.now()}`);

                socket.emit('call:signal', { to: data.from, signal: sdp, sessionId: sessionIdRef.current });
                setCallState(p => ({ ...p, status: 'connecting' }));
            } catch (err) {
                console.error('[WebRTC] createOffer error:', err);
                socket.emit('call:end', { to: data.from, sessionId: sessionIdRef.current });
                cleanup();
            }
        };

        // SDP offer/answer relay — no ICE candidates here (FIX #1)
        const onCallSignal = async (data: { from: string; signal: RTCSessionDescriptionInit; sessionId?: string }) => {
            const { signal, from } = data;
            if (data.sessionId) sessionIdRef.current = data.sessionId;
            console.log('[WebRTC] SDP signal:', signal.type, 'from', from);

            if (signal.type === 'offer') {
                // Answerer side
                if (!localStreamRef.current) {
                    console.error('[WebRTC] No local stream for offer');
                    socket.emit('call:end', { to: from, sessionId: sessionIdRef.current });
                    cleanup(); return;
                }
                try {
                    const pc = pcRef.current || createPeerConnection(from);
                    // FIX #6: ensure tracks added before setRemoteDescription
                    if (localStreamRef.current) {
                        localStreamRef.current.getTracks().forEach(t => { try { pc.addTrack(t, localStreamRef.current!); } catch { /* already added */ } });
                    }
                    const sdp = { type: signal.type, sdp: optimizeSDP(signal.sdp || '') } as RTCSessionDescriptionInit;
                    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
                        console.error(`[WebRTC Forensic] Cannot set remote offer, signalingState is ${pc.signalingState}`);
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                    console.log(`[WebRTC Forensic] REMOTE SDP (Offer) Set at ${Date.now()}`);
                    await drainIceQueue(pc); // FIX #3

                    const answer = await pc.createAnswer();
                    const answerSdp = { type: answer.type, sdp: optimizeSDP(answer.sdp || '') } as RTCSessionDescriptionInit;
                    if (pc.signalingState !== 'have-remote-offer') {
                        console.error(`[WebRTC Forensic] Cannot set local answer, signalingState is ${pc.signalingState}`);
                    }
                    await pc.setLocalDescription(answerSdp);
                    console.log(`[WebRTC Forensic] LOCAL SDP (Answer) Set at ${Date.now()}`);
                    socket.emit('call:signal', { to: from, signal: answerSdp, sessionId: sessionIdRef.current });
                } catch (err) {
                    console.error('[WebRTC] offer handling error:', err);
                    socket.emit('call:end', { to: from, sessionId: sessionIdRef.current });
                    cleanup();
                }

            } else if (signal.type === 'answer') {
                // Caller side
                const pc = pcRef.current;
                if (!pc) { console.error('[WebRTC] No PC for answer'); return; }
                try {
                    const sdp = { type: signal.type, sdp: optimizeSDP(signal.sdp || '') } as RTCSessionDescriptionInit;
                    if (pc.signalingState !== 'have-local-offer') {
                        console.error(`[WebRTC Forensic] Cannot set remote answer, signalingState is ${pc.signalingState}`);
                        return;
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                    console.log(`[WebRTC Forensic] REMOTE SDP (Answer) Set at ${Date.now()}`);
                    await drainIceQueue(pc); // FIX #3
                } catch (err) {
                    console.error('[WebRTC] answer handling error:', err);
                }
            }
        };

        // FIX #1: Receive ICE candidates via call:ice-candidate (not call:signal)
        // FIX #3: Queue candidates if remote description not yet set
        const onIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit; sessionId?: string }) => {
            console.log(`[WebRTC Forensic] ICE Reception at ${Date.now()}`);
            const pc = pcRef.current;
            if (!pc) {
                console.log(`[WebRTC Forensic] Queuing ICE candidate (No PC yet) at ${Date.now()}`);
                iceCandidateQueue.current.push(data.candidate);
                return;
            }
            if (!pc.remoteDescription) {
                console.log(`[WebRTC Forensic] Queuing ICE candidate (no remote desc yet) at ${Date.now()}`);
                iceCandidateQueue.current.push(data.candidate);
                return;
            }
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log(`[WebRTC Forensic] ICE Candidate added successfully at ${Date.now()}`);
            } catch (e) {
                console.error(`[WebRTC Forensic] addIceCandidate error at ${Date.now()}:`, e);
            }
        };

        const onCallEnded = () => {
            if (currentStatus.current === 'incoming') {
                toast(`📞 Missed call from ${otherUserRef.current?.full_name || 'Unknown'}`, { duration: 5000 });
            }
            cleanup();
        };

        socket.on('call:incoming',   onCallIncoming);
        socket.on('call:ringing',    onCallRinging);
        socket.on('call:answered',   onCallAnswered); // FIX #2: was call:ready (server never handled it)
        socket.on('call:signal',     onCallSignal);
        socket.on('call:ice-candidate', onIceCandidate); // FIX #1
        socket.on('call:rejected',   cleanup);
        socket.on('call:ended',      onCallEnded);
        socket.on('call:timeout',    onCallEnded);

        return () => {
            socket.off('call:incoming',   onCallIncoming);
            socket.off('call:ringing',    onCallRinging);
            socket.off('call:answered',   onCallAnswered);
            socket.off('call:signal',     onCallSignal);
            socket.off('call:ice-candidate', onIceCandidate);
            socket.off('call:rejected',   cleanup);
            socket.off('call:ended',      onCallEnded);
            socket.off('call:timeout',    onCallEnded);
        };
    }, [socket, socketConnected, cleanup, createPeerConnection, drainIceQueue]);

    const overlayStatus = callState.status as 'calling' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting';

    return (
        <WebRTCContext.Provider value={{
            callState, localStream, remoteStream, isMuted, isVideoEnabled,
            startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo,
        }}>
            {children}
            {callState.status !== 'idle' && (
                <CallOverlay
                    callState={{ type: callState.type, status: overlayStatus, connectedAt: callState.connectedAt }}
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
