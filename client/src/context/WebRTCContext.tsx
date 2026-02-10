import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'incoming' | 'connected';
    otherUser: string | null; // userId
    conversationId: string | null;
}

interface WebRTCContextValue {
    callState: CallState;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    startCall: (userId: string, conversationId: string, type: 'voice' | 'video') => Promise<void>;
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

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { user } = useAuth();
    
    const [callState, setCallState] = useState<CallState>({
        type: null,
        status: 'idle',
        otherUser: null,
        conversationId: null
    });
    
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);

    const cleanup = useCallback(() => {
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null });
        pendingOffer.current = null;
    }, [localStream]);

    const createPeerConnection = useCallback((otherUserId: string) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('call:ice', { to: otherUserId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log('[WebRTC] Received remote track');
            setRemoteStream(event.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection state:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                cleanup();
            }
        };

        peerConnection.current = pc;
        return pc;
    }, [socket, cleanup]);

    const startCall = async (otherUserId: string, conversationId: string, type: 'voice' | 'video') => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video'
            });
            setLocalStream(stream);
            setCallState({ type, status: 'calling', otherUser: otherUserId, conversationId });
            if (socket && user) {
                socket.emit('call:init', { to: otherUserId, from: user.id, type, conversationId });
            }
        } catch (err) {
            console.error('Failed to start call:', err);
            toast.error('Could not access camera/microphone');
            cleanup();
        }
    };

    const rejectCall = () => {
        if (socket && callState.otherUser && user) {
            socket.emit('call:end', { to: callState.otherUser, from: user.id, conversationId: callState.conversationId });
        }
        cleanup();
    };

    const endCall = () => {
        if (socket && callState.otherUser && user) {
            socket.emit('call:end', { to: callState.otherUser, from: user.id, conversationId: callState.conversationId });
        }
        cleanup();
    };

    const toggleMute = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStream && callState.type === 'video') {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoEnabled(videoTrack.enabled);
            }
        }
    };

    // Socket listeners
    useEffect(() => {
        if (!socket || !socketConnected || !user) return;

        const onCallIncoming = ({ from, type, conversationId }: { from: string, type: 'voice' | 'video', conversationId: string }) => {
            if (callState.status !== 'idle') {
                console.log('[WebRTC] Busy, rejecting call from:', from);
                socket.emit('call:end', { to: from, conversationId });
                return;
            }
            console.log('[WebRTC] Incoming call from:', from);
            setCallState({ type, status: 'incoming', otherUser: from, conversationId });
            toast(`Incoming ${type} call from ${from}`);
        };

        const onCallOffer = async ({ from, offer }: { from: string, offer: RTCSessionDescriptionInit }) => {
            console.log('[WebRTC] Received offer from:', from);
            if (callState.otherUser && callState.otherUser !== from) {
                console.warn('[WebRTC] Offer from unexpected user:', from);
                return;
            }
            pendingOffer.current = offer;
        };

        const onRecipientReady = async ({ from }: { from: string }) => {
            console.log('[WebRTC] Recipient ready:', from);
            if (callState.status === 'calling' && callState.otherUser === from) {
                const pc = createPeerConnection(from);
                localStream?.getTracks().forEach(track => pc.addTrack(track, localStream));
                
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('call:offer', { to: from, offer });
                } catch (err) {
                    console.error('[WebRTC] Failed to create offer:', err);
                }
            }
        };

        const onCallAnswer = async ({ from, answer }: { from: string, answer: RTCSessionDescriptionInit }) => {
            console.log('[WebRTC] Received answer from:', from);
            if (peerConnection.current && callState.otherUser === from) {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
                setCallState(prev => ({ ...prev, status: 'connected' }));
            }
        };

        const onCallIce = async ({ from, candidate }: { from: string, candidate: RTCIceCandidateInit }) => {
            if (peerConnection.current && callState.otherUser === from) {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        };

        const onCallEnded = ({ from }: { from: string }) => {
            if (callState.otherUser === from) {
                cleanup();
                toast('Call ended');
            }
        };

        socket.on('call:incoming', onCallIncoming);
        socket.on('call:offer', onCallOffer);
        socket.on('call:ready', onRecipientReady);
        socket.on('call:answer', onCallAnswer);
        socket.on('call:ice', onCallIce);
        socket.on('call:ended', onCallEnded);

        return () => {
            socket.off('call:incoming', onCallIncoming);
            socket.off('call:offer', onCallOffer);
            socket.off('call:ready', onRecipientReady);
            socket.off('call:answer', onCallAnswer);
            socket.off('call:ice', onCallIce);
            socket.off('call:ended', onCallEnded);
        };
    }, [socket, socketConnected, user, callState.status, callState.otherUser, localStream, createPeerConnection, cleanup]);

    // Accept call logic - now emits 'call:ready'
    const acceptCall = async () => {
        if (!callState.otherUser || !socket || !user) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callState.type === 'video'
            });
            setLocalStream(stream);

            // 1. Mark as calling (waiting for link)
            setCallState(prev => ({ ...prev, status: 'calling' }));

            // 2. Signal to sender that we are ready to receive the offer
            socket.emit('call:ready', { to: callState.otherUser });
        } catch (err) {
            console.error('Failed to accept call:', err);
            toast.error('Could not access media devices');
            cleanup();
        }
    };

    // Effect to handle incoming offer after accepting or receiving early
    useEffect(() => {
        const handleOffer = async () => {
            // Only process if we have an offer AND we have local stream (after accept)
            if (callState.status === 'calling' && callState.otherUser && pendingOffer.current && socket && localStream) {
                console.log('[WebRTC] Processing pending offer for caller:', callState.otherUser);
                const pc = createPeerConnection(callState.otherUser);
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    
                    socket.emit('call:answer', { to: callState.otherUser, answer });
                    pendingOffer.current = null;
                    setCallState(prev => ({ ...prev, status: 'connected' }));
                } catch (err) {
                    console.error('[WebRTC] Error processing offer:', err);
                    cleanup();
                }
            }
        };
        handleOffer();
    }, [callState.status, callState.otherUser, socket, createPeerConnection, localStream, cleanup]);

    return (
        <WebRTCContext.Provider value={{
            callState,
            localStream,
            remoteStream,
            startCall,
            acceptCall,
            rejectCall,
            endCall,
            toggleMute,
            toggleVideo,
            isMuted,
            isVideoEnabled
        }}>
            {children}
        </WebRTCContext.Provider>
    );
};
