import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useChat } from './ChatContext';
import toast from 'react-hot-toast';
import { CallOverlay } from '../components/chat/CallOverlay';
import api from '../api/axiosInstance';
import { resolveLocalUrl } from '../lib/networkUtils';

// Fix #3: ICE servers are served by the gateway, not the API server.
// VITE_API_URL  → Node.js API  (port 5001) — does NOT have /webrtc routes
// VITE_SOCKET_URL → Gateway    (port 5000) — serves /webrtc/ice-servers
const rawGatewayUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const GATEWAY_URL = resolveLocalUrl(rawGatewayUrl, 'http://localhost:5000');

// ── Structured call-trace logger ──────────────────────────────────────────────
// Emits structured [CALL_TRACE] lines so the signaling lifecycle can be
// audited step-by-step in the browser DevTools console.
let _callTraceStep = 0;
const callTrace = (step: string, detail?: Record<string, unknown>) => {
    _callTraceStep++;
    console.log(`[CALL_TRACE #${_callTraceStep}] ${step}`, detail ?? '');
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting';
    otherUser: { id: string; full_name: string; avatar_url?: string } | null;
    conversationId: string | null;
    connectedAt: number | null;
    sessionId: string | null;
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


const getAudioConstraints = (): MediaTrackConstraints => ({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
});

/**
 * Validates a captured MediaStream and forces all tracks enabled.
 * Returns an error message if audio tracks are missing or hardware-muted,
 * otherwise returns null (stream is ready to use).
 */
const validateStream = (stream: MediaStream, needsAudio: boolean): string | null => {
    const audioTracks = stream.getAudioTracks();
    if (needsAudio && audioTracks.length === 0) {
        return 'No microphone track captured. Please check your microphone is connected and not blocked.';
    }
    // Force-enable all tracks — browsers can return tracks with enabled=false in some edge cases
    stream.getTracks().forEach(t => { t.enabled = true; });
    // Detect OS-level mute (track.muted is read-only and set by the hardware)
    const mutedAudio = audioTracks.filter(t => t.muted);
    if (needsAudio && mutedAudio.length === audioTracks.length && audioTracks.length > 0) {
        console.warn('[WebRTC] ⚠️ All audio tracks are hardware-muted. Check OS microphone privacy settings.');
        // Don't abort — the track may un-mute once the connection is established
    }
    return null;
};

const getVideoConstraints = (): MediaTrackConstraints => ({
    facingMode: 'user',
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 24, max: 30 },
});

// ── Provider ──────────────────────────────────────────────────────────────────
export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { sendMessageToConversation } = useChat();

    const [callState, setCallState] = useState<CallState>({
        type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null, sessionId: null,
    });
    const [localStream, setLocalStream]       = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream]     = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted]               = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    // ── Stable refs (no stale-closure issues) ────────────────────────────────
    const pcRef             = useRef<RTCPeerConnection | null>(null);
    const localStreamRef    = useRef<MediaStream | null>(null);
    const persistentRemote  = useRef<MediaStream | null>(null); // single stream object, tracks added to it
    const callTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
    // FIX: currentStatus is updated SYNCHRONOUSLY in cleanup/startCall, not via useEffect
    const currentStatus     = useRef<CallState['status']>('idle');
    const otherUserRef      = useRef<CallState['otherUser']>(null);
    const sessionIdRef      = useRef<string | null>(null);
    const targetUserIdRef   = useRef<string | null>(null);
    const callTypeRef       = useRef<'voice' | 'video' | null>(null);
    const conversationIdRef = useRef<string | null>(null);
    const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
    const isCleaningUp      = useRef(false);
    const fetchedIceServers = useRef<RTCIceServer[] | null>(null);
    const dialToneRef       = useRef<HTMLAudioElement | null>(null);
    const ringtoneRef       = useRef<HTMLAudioElement | null>(null);

    // Keep otherUserRef in sync (read in socket handlers)
    useEffect(() => { otherUserRef.current = callState.otherUser; }, [callState.otherUser]);

    // ── Audio unlock for iOS ──────────────────────────────────────────────────
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
    // Fix #3: /webrtc/ice-servers is served by the realtime-gateway (GATEWAY_URL / VITE_SOCKET_URL),
    // NOT by the Node.js API server (VITE_API_URL). Using the wrong endpoint caused
    // silent 404s and fallback to Google STUN-only, breaking calls on LTE and NAT.
    const ensureIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
        if (fetchedIceServers.current) return fetchedIceServers.current;
        try {
            callTrace('Fetching ICE servers from gateway', { url: `${GATEWAY_URL}/webrtc/ice-servers` });
            const authHeader = api.defaults.headers.common?.['Authorization'];
            const res = await fetch(`${GATEWAY_URL}/webrtc/ice-servers`, {
                headers: authHeader ? { Authorization: String(authHeader) } : {},
            });
            if (res.ok) {
                const data = await res.json();
                if (data?.iceServers) {
                    const hasTurn = (data.iceServers as RTCIceServer[]).some(s => String(s.urls).startsWith('turn'));
                    callTrace('ICE servers ready', { count: data.iceServers.length, hasTurn });
                    fetchedIceServers.current = data.iceServers;
                    return data.iceServers;
                }
            }
            console.warn('[WebRTC] ICE server endpoint returned unexpected status:', res.status);
        } catch (e) {
            console.warn('[WebRTC] ICE server fetch failed — using STUN-only fallback:', e);
        }
        callTrace('ICE server fetch failed — falling back to Google STUN only');
        fetchedIceServers.current = FALLBACK_ICE;
        return FALLBACK_ICE;
    }, []);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (isCleaningUp.current) return;
        isCleaningUp.current = true;

        // FIX: Update ref IMMEDIATELY so startCall guard reads correct state
        currentStatus.current = 'idle';

        if (callTimeoutRef.current)  { clearTimeout(callTimeoutRef.current);  callTimeoutRef.current = null; }
        if (reconnectTimer.current)  { clearTimeout(reconnectTimer.current);   reconnectTimer.current = null; }

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

        persistentRemote.current  = null;
        iceCandidateQueue.current = [];
        targetUserIdRef.current   = null;
        sessionIdRef.current      = null;

        stopAllAudio();
        setLocalStream(null);
        setRemoteStream(null);
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null, connectedAt: null, sessionId: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
        setTimeout(() => { isCleaningUp.current = false; }, 100);
    }, [stopAllAudio]);

    // ── Drain queued ICE candidates ───────────────────────────────────────────
    const drainIceQueue = useCallback(async (pc: RTCPeerConnection) => {
        if (!pc.remoteDescription) return;
        const queue = [...iceCandidateQueue.current];
        iceCandidateQueue.current = [];
        console.log(`[WebRTC] Draining ${queue.length} buffered ICE candidates`);
        for (const c of queue) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { console.warn('[WebRTC] ICE drain error:', e); }
        }
    }, []);

    // ── Create RTCPeerConnection ───────────────────────────────────────────────
    const createPeerConnection = useCallback((targetUserId: string): RTCPeerConnection => {
        // Close old PC if any
        if (pcRef.current) {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack        = null;
            pcRef.current.close();
            pcRef.current = null;
        }

        const remoteMs = new MediaStream();
        persistentRemote.current = remoteMs;

        const pc = new RTCPeerConnection({
            iceServers:           fetchedIceServers.current || FALLBACK_ICE,
            iceCandidatePoolSize: 10,
            bundlePolicy:         'max-bundle',
            rtcpMuxPolicy:        'require',
        });

        pc.onicecandidate = (e) => {
            if (e.candidate && socket) {
                socket.emit('call:ice-candidate', {
                    to: targetUserId, candidate: e.candidate.toJSON(), sessionId: sessionIdRef.current,
                });
            }
        };

        pc.ontrack = (event) => {
            console.log('[WebRTC] ontrack:', event.track.kind, event.track.id);
            if (!remoteMs.getTracks().find(t => t.id === event.track.id)) {
                remoteMs.addTrack(event.track);
            }
            setRemoteStream(new MediaStream(remoteMs.getTracks()));
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            callTrace(`RTCPeerConnection state changed`, { connectionState: state, iceState: pc.iceConnectionState });

            if (state === 'connected') {
                if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
                currentStatus.current = 'connected';
                setCallState(p => ({ ...p, status: 'connected', connectedAt: p.connectedAt || Date.now() }));
            }

            if (state === 'disconnected') {
                currentStatus.current = 'reconnecting';
                setCallState(p => ({ ...p, status: 'reconnecting' }));
                reconnectTimer.current = setTimeout(() => {
                    if (pcRef.current?.connectionState === 'disconnected') {
                        console.log('[WebRTC] Attempting ICE restart after disconnect');
                        pcRef.current.restartIce();
                        reconnectTimer.current = setTimeout(() => {
                            if (pcRef.current?.connectionState !== 'connected') {
                                socket?.emit('call:end', { to: targetUserIdRef.current, sessionId: sessionIdRef.current, conversationId: conversationIdRef.current });
                                cleanup();
                            }
                        }, 10000);
                    }
                }, 8000);
            }

            if (state === 'failed') {
                console.log('[WebRTC] Failed — ICE restart');
                try { pcRef.current?.restartIce(); } catch { /* ignore */ }
                reconnectTimer.current = setTimeout(() => {
                    if (pcRef.current?.connectionState !== 'connected') {
                        socket?.emit('call:end', { to: targetUserIdRef.current, sessionId: sessionIdRef.current, conversationId: conversationIdRef.current });
                        cleanup();
                    }
                }, 8000);
            }
        };

        pc.oniceconnectionstatechange = () => {
            callTrace('ICE connection state changed', { iceConnectionState: pc.iceConnectionState });
        };

        pcRef.current = pc;
        return pc;
    }, [socket, cleanup]);

    // ── startCall (CALLER) ────────────────────────────────────────────────────
    const startCall = useCallback(async (
        targetUserId: string, conversationId: string, type: 'voice' | 'video', otherUser: CallState['otherUser'],
    ) => {
        // CALL_TRACE Step 1
        callTrace('User clicked call', { targetUserId, type, conversationId, socketConnected });

        if (currentStatus.current !== 'idle') {
            console.warn('[WebRTC] startCall ignored — current status:', currentStatus.current);
            return;
        }

        // Fix #2: Guard against silent socket?.emit() drops.
        if (!socket || !socketConnected) {
            callTrace('Call blocked — socket not connected', { socketExists: !!socket, socketConnected });
            toast.error('Connection not ready. Please wait a moment and try again.');
            return;
        }

        targetUserIdRef.current   = targetUserId;
        callTypeRef.current       = type;
        conversationIdRef.current = conversationId;
        currentStatus.current     = 'calling';
        setCallState({ type, status: 'calling', otherUser, conversationId, connectedAt: null, sessionId: null });

        try {
            await ensureIceServers();
            // Acquire media — caller has mic/cam ready while phone rings
            callTrace('Requesting user media', { audio: true, video: type === 'video' });
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(),
                video: type === 'video' ? getVideoConstraints() : false,
            });

            // Validate stream: ensure audio tracks exist and are enabled
            const streamError = validateStream(stream, true);
            if (streamError) {
                stream.getTracks().forEach(t => t.stop());
                toast.error(streamError);
                currentStatus.current = 'idle';
                return;
            }

            localStreamRef.current = stream;
            setLocalStream(stream);
            callTrace('Local stream acquired', { audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });

            // CALL_TRACE Step 3
            callTrace('Emitting call:initiate to gateway', { to: targetUserId, type, conversationId });
            socket.emit('call:initiate', { to: targetUserId, type, callType: type, conversationId });
            sendMessageToConversation({ conversationId, content: `Started a ${type} call`, type: 'call' });

            callTimeoutRef.current = setTimeout(() => {
                if (currentStatus.current === 'calling' || currentStatus.current === 'ringing') {
                    toast.error('No answer');
                    socket?.emit('call:timeout', { to: targetUserId, sessionId: sessionIdRef.current });
                    cleanup();
                }
            }, 60000);
        } catch (err: unknown) {
            console.error('[WebRTC] startCall error:', err);
            const name = (err as { name?: string })?.name;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                toast.error('Microphone access denied. Please allow microphone access in your browser settings.');
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                toast.error('No microphone found. Please connect a microphone and try again.');
            } else {
                toast.error('Could not access microphone. Check your browser permissions.');
            }
            currentStatus.current = 'idle';
            cleanup();
        }
    }, [socket, socketConnected, ensureIceServers, sendMessageToConversation, cleanup]);

    // ── acceptCall (CALLEE) ───────────────────────────────────────────────────
    const acceptCall = useCallback(async () => {
        const { otherUser, type, sessionId } = callState;
        if (!otherUser?.id) { cleanup(); return; }
        targetUserIdRef.current = otherUser.id;

        // CALL_TRACE Step 6
        callTrace('Callee accepted call', { from: otherUser.id, type, sessionId });

        try {
            await ensureIceServers();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(),
                video: type === 'video' ? getVideoConstraints() : false,
            });

            // Validate stream: ensure audio tracks exist and are enabled
            const streamError = validateStream(stream, true);
            if (streamError) {
                stream.getTracks().forEach(t => t.stop());
                toast.error(streamError);
                cleanup();
                return;
            }

            localStreamRef.current = stream;
            setLocalStream(stream);
            callTrace('Callee stream ready', { audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });

            // Create PC and add tracks BEFORE emitting call:answer so PC exists when offer arrives
            const pc = createPeerConnection(otherUser.id);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));
            console.log('[WebRTC] Callee PC ready — emitting call:answer');

            socket?.emit('call:answer', { to: otherUser.id, sessionId });
            currentStatus.current = 'connecting';
            setCallState(p => ({ ...p, status: 'connecting' }));
        } catch (err: unknown) {
            console.error('[WebRTC] acceptCall error:', err);
            const name = (err as { name?: string })?.name;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                toast.error('Microphone access denied. Please allow microphone access in your browser settings.');
            } else {
                toast.error('Could not access microphone. Check your browser permissions.');
            }
            cleanup();
        }
    }, [callState, socket, ensureIceServers, createPeerConnection, cleanup]);

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

        // ── Callee receives incoming call ────────────────────────────────────
        const onCallIncoming = (data: {
            from: string; fromName?: string; fromAvatar?: string;
            type?: 'voice' | 'video'; callType?: 'voice' | 'video';
            conversationId: string; sessionId?: string;
            isSync?: boolean;
        }) => {
            // CALL_TRACE Step 4/5: Callee received incoming call
            callTrace('call:incoming received', { from: data.from, type: data.type || data.callType, sessionId: data.sessionId, isSync: data.isSync, currentStatus: currentStatus.current });

            // If we are already in an active call, reject this incoming signal.
            if (currentStatus.current !== 'idle') {
                if (!data.isSync) {
                    socket.emit('call:reject', { to: data.from, sessionId: data.sessionId });
                }
                callTrace('call:incoming ignored — not idle', { currentStatus: currentStatus.current });
                return;
            }

            const resolvedType = data.type || data.callType || 'voice';
            targetUserIdRef.current = data.from;
            if (!sessionIdRef.current) {
                sessionIdRef.current = data.sessionId || null;
            }
            currentStatus.current = 'incoming';
            setCallState({
                type: resolvedType, status: 'incoming',
                otherUser: { id: data.from, full_name: data.fromName || 'Unknown', avatar_url: data.fromAvatar },
                conversationId: data.conversationId, connectedAt: null, sessionId: data.sessionId || null,
            });
            socket.emit('call:ringing', { to: data.from });
            callTrace('call:ringing emitted to caller', { to: data.from });
        };

        // ── Caller: callee's device is ringing ───────────────────────────────
        const onCallRinging = () => {
            callTrace('call:ringing received — callee device is ringing', { currentStatus: currentStatus.current });
            if (currentStatus.current === 'calling') {
                currentStatus.current = 'ringing';
                setCallState(p => ({ ...p, status: 'ringing' }));
            }
        };

        // ── Caller: callee answered — NOW create PC and send offer ───────────
        const onCallAnswered = async (data: { from: string; sessionId?: string }) => {
            if (currentStatus.current !== 'calling' && currentStatus.current !== 'ringing') return;
            const { from, sessionId } = data;
            callTrace('call:answered received', { from, sessionId });

            if (sessionId && sessionIdRef.current && sessionId !== sessionIdRef.current) {
                console.warn('[WebRTC] Ignoring stray call:answered for session:', sessionId);
                return;
            }

            if (sessionId) {
                sessionIdRef.current = sessionId;
                setCallState(p => ({ ...p, sessionId: sessionId || null }));
            }

            const stream = localStreamRef.current;
            if (!stream) {
                console.error('[WebRTC] No local stream — cannot create offer');
                socket.emit('call:end', { to: data.from, sessionId: sessionIdRef.current });
                cleanup(); return;
            }

            try {
                // Caller creates PC here — AFTER callee is confirmed ready
                const pc = createPeerConnection(data.from);
                stream.getTracks().forEach(t => pc.addTrack(t, stream));

                const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: callTypeRef.current === 'video',
                });
                await pc.setLocalDescription(offer);
                callTrace('Offer created and set — emitting call:signal');
                socket.emit('call:signal', { to: data.from, signal: { type: offer.type, sdp: offer.sdp }, sessionId: sessionIdRef.current });
                currentStatus.current = 'connecting';
                setCallState(p => ({ ...p, status: 'connecting' }));
            } catch (err) {
                console.error('[WebRTC] createOffer error:', err);
                socket.emit('call:end', { to: data.from, sessionId: sessionIdRef.current });
                cleanup();
            }
        };

        // ── SDP offer / answer relay ─────────────────────────────────────────
        const onCallSignal = async (data: { from: string; signal: RTCSessionDescriptionInit; sessionId?: string }) => {
            const { signal, from, sessionId } = data;
            callTrace('call:signal received', { sdpType: signal.type, from, sessionId });

            if (sessionId && sessionIdRef.current && sessionId !== sessionIdRef.current) {
                console.warn('[WebRTC] Ignoring stray SDP signal for session:', sessionId, '(active:', sessionIdRef.current, ')');
                return;
            }

            if (sessionId) sessionIdRef.current = sessionId;

            if (signal.type === 'offer') {
                // ★ FIX (Bug 1 complement): Use EXISTING PC — never create a new one here.
                // The callee created the PC inside acceptCall() before emitting call:answer.
                const pc = pcRef.current;
                if (!pc) {
                    console.error('[WebRTC] No PC for offer — callee PC was not created in acceptCall()');
                    socket.emit('call:end', { to: from, sessionId: sessionIdRef.current });
                    cleanup(); return;
                }
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                    await drainIceQueue(pc);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('call:signal', { to: from, signal: { type: answer.type, sdp: answer.sdp }, sessionId: sessionIdRef.current });
                    console.log('[WebRTC] Answer sent');
                } catch (err) {
                    console.error('[WebRTC] Offer handling error:', err);
                    socket.emit('call:end', { to: from, sessionId: sessionIdRef.current });
                    cleanup();
                }

            } else if (signal.type === 'answer') {
                const pc = pcRef.current;
                if (!pc) { console.warn('[WebRTC] No PC for answer — ignoring'); return; }
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                    await drainIceQueue(pc);
                    console.log('[WebRTC] Remote answer set');
                } catch (err) {
                    console.error('[WebRTC] Answer handling error:', err);
                }
            }
        };

        // ── ICE trickle ──────────────────────────────────────────────────────
        const onIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit; sessionId?: string }) => {
            const { candidate, sessionId } = data;
            if (sessionId && sessionIdRef.current && sessionId !== sessionIdRef.current) {
                console.warn('[WebRTC] Ignoring stray ICE candidate for session:', sessionId);
                return;
            }
            const pc = pcRef.current;
            if (!pc) {
                // No PC yet — queue for later
                iceCandidateQueue.current.push(candidate);
                return;
            }
            if (!pc.remoteDescription) {
                // PC exists but remote description not yet set — queue and return
                iceCandidateQueue.current.push(candidate);
                return;
            }
            // BUG FIX: remoteDescription is already set, so drain the full queue first
            // then add this candidate. This closes the async timing gap where candidates
            // arrive after setRemoteDescription completes but before drainIceQueue runs.
            if (iceCandidateQueue.current.length > 0) {
                console.log('[WebRTC] ICE candidate arrived with existing queue — draining first');
                await drainIceQueue(pc);
            }
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('[WebRTC] addIceCandidate error:', e);
            }
        };

        const onCallEnded = () => {
            if (currentStatus.current === 'incoming') {
                toast(`📞 Missed call from ${otherUserRef.current?.full_name || 'Unknown'}`, { duration: 5000 });
            }
            cleanup();
        };

        socket.on('call:incoming',      onCallIncoming);
        socket.on('call:ringing',       onCallRinging);
        socket.on('call:answered',      onCallAnswered);
        socket.on('call:signal',        onCallSignal);
        socket.on('call:ice-candidate', onIceCandidate);
        socket.on('call:rejected',      cleanup);
        socket.on('call:ended',         onCallEnded);
        socket.on('call:timeout',       onCallEnded);

        return () => {
            socket.off('call:incoming',      onCallIncoming);
            socket.off('call:ringing',       onCallRinging);
            socket.off('call:answered',      onCallAnswered);
            socket.off('call:signal',        onCallSignal);
            socket.off('call:ice-candidate', onIceCandidate);
            socket.off('call:rejected',      cleanup);
            socket.off('call:ended',         onCallEnded);
            socket.off('call:timeout',       onCallEnded);
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
