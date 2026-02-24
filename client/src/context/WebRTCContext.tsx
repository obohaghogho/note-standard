import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { CallOverlay } from '../components/chat/CallOverlay';
import toast from 'react-hot-toast';

interface CallState {
    type: 'voice' | 'video' | null;
    status: 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected';
    otherUser: string | null; // userId
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

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket, connected: socketConnected } = useSocket();
    const { user } = useAuth();
    const { sendMessage } = useChat();
    
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
    const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);
    const iceQueue = useRef<RTCIceCandidateInit[]>([]);
    const callTimeoutRef = useRef<any>(null);
    const currentCallStatus = useRef<'idle' | 'calling' | 'incoming' | 'connecting' | 'connected'>('idle');

    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);

    const cleanup = useCallback(() => {
        console.log('[WebRTC] Running cleanup');
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
        if (peerConnection.current) {
            peerConnection.current.onicecandidate = null;
            peerConnection.current.ontrack = null;
            peerConnection.current.onconnectionstatechange = null;
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null });
        setPendingOffer(null);
        iceQueue.current = [];
        setIsMuted(false);
        setIsVideoEnabled(true);
    }, [localStream]);

    const createPeerConnection = useCallback((otherUserId: string) => {
        console.log('[WebRTC] Creating RTCPeerConnection for:', otherUserId);
        const pc = new RTCPeerConnection(ICE_SERVERS);

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('call:ice', { to: otherUserId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log('[WebRTC] Received remote track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            } else {
                const newStream = new MediaStream([event.track]);
                setRemoteStream(newStream);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection state change:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                cleanup();
            }
            if (pc.connectionState === 'connected') {
                setCallState(prev => ({ ...prev, status: 'connected' }));
            }
        };

        peerConnection.current = pc;
        return pc;
    }, [socket, cleanup]);

    const startCall = async (otherUserId: string, conversationId: string, type: 'voice' | 'video', name?: string, avatar?: string) => {
        try {
            console.log('[WebRTC] startCall sequence:', { to: otherUserId, type });
            
            setCallState({ 
                type, 
                status: 'calling', 
                otherUser: otherUserId, 
                otherUserName: name || 'User',
                otherUserAvatar: avatar,
                conversationId 
            });

            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video'
            });
            setLocalStream(stream);
            
            if (socket && user) {
                socket.emit('call:init', { to: otherUserId, from: user.id, type, conversationId });
                sendMessage(`Started ${type} call`, 'call').catch(err => console.warn('Failed to log call:', err));
            }

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling' || currentCallStatus.current === 'connecting') {
                    console.log('[WebRTC] Call timed out (no answer)');
                    toast.error('Recipient did not answer');
                    endCall();
                }
            }, 45000);

        } catch (err) {
            console.error('[WebRTC] startCall failed:', err);
            toast.error('Could not access camera/microphone. Ensure permissions are granted.');
            cleanup();
        }
    };

    const rejectCall = () => {
        if (socket && callState.otherUser && user) {
            socket.emit('call:end', { to: callState.otherUser, from: user.id, conversationId: callState.conversationId });
            sendMessage('Missed call', 'call').catch(err => console.warn('Failed to log reject:', err));
        }
        cleanup();
    };

    const endCall = () => {
        if (socket && callState.otherUser && user) {
            socket.emit('call:end', { to: callState.otherUser, from: user.id, conversationId: callState.conversationId });
            sendMessage('Call ended', 'call').catch(err => console.warn('Failed to log end:', err));
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

    const acceptCall = async () => {
        if (!callState.otherUser || !socket || !user) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callState.type === 'video'
            });
            setLocalStream(stream);
            setCallState(prev => ({ ...prev, status: 'connecting' }));
            socket.emit('call:ready', { to: callState.otherUser });
        } catch (err) {
            console.error('[WebRTC] Failed to accept call:', err);
            toast.error('Could not access media devices');
            cleanup();
        }
    };

    // Socket listeners
    useEffect(() => {
        if (!socket || !socketConnected || !user) return;

        const onCallIncoming = (data: any) => {
            const { from, fromName, fromAvatar, type, conversationId } = data;
            if (currentCallStatus.current !== 'idle') {
                console.log('[WebRTC] Busy, rejecting call from:', from);
                socket.emit('call:end', { to: from, conversationId });
                return;
            }
            console.log('[WebRTC] Incoming call from:', fromName || from);
            setCallState({ 
                type, 
                status: 'incoming', 
                otherUser: from, 
                otherUserName: fromName || 'User',
                otherUserAvatar: fromAvatar,
                conversationId 
            });
        };

        const onCallOffer = async ({ from, offer }: { from: string, offer: RTCSessionDescriptionInit }) => {
            console.log('[WebRTC] Received offer from:', from);
            setPendingOffer(offer);
        };

        const onRecipientReady = async ({ from }: { from: string }) => {
            console.log('[WebRTC] Recipient ready:', from);
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            
            if (currentCallStatus.current === 'calling') {
                const pc = createPeerConnection(from);
                if (localStream) {
                    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                }
                
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('call:offer', { to: from, offer });
                } catch (err) {
                    console.error('[WebRTC] Failed to create offer:', err);
                    cleanup();
                }
            }
        };

        const onCallAnswer = async ({ from, answer }: { from: string, answer: RTCSessionDescriptionInit }) => {
            console.log('[WebRTC] Received answer from:', from);
            if (peerConnection.current) {
                try {
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
                    setCallState(prev => ({ ...prev, status: 'connected' }));
                    
                    while (iceQueue.current.length > 0) {
                        const candidate = iceQueue.current.shift();
                        if (candidate) await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                } catch (err) {
                    console.error('[WebRTC] Error setting remote description:', err);
                }
            }
        };

        const onCallIce = async ({ from, candidate }: { from: string, candidate: RTCIceCandidateInit }) => {
            if (peerConnection.current && peerConnection.current.remoteDescription) {
                try {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error('[WebRTC] Error adding ICE candidate:', err);
                }
            } else {
                iceQueue.current.push(candidate);
                console.log('[WebRTC] Queued ICE candidate from:', from);
            }
        };

        const onCallEnded = ({ from }: { from: string }) => {
            console.log('[WebRTC] Call ended by:', from);
            cleanup();
            toast('Call ended');
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
    }, [socket, socketConnected, user, localStream, createPeerConnection, cleanup]);

    // Effect to handle incoming offer after accepting
    useEffect(() => {
        const handleOffer = async () => {
            if (callState.status === 'connecting' && callState.otherUser && pendingOffer && socket && localStream) {
                console.log('[WebRTC] Processing pending offer');
                const pc = createPeerConnection(callState.otherUser);
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    
                    socket.emit('call:answer', { to: callState.otherUser, answer });
                    setPendingOffer(null);
                    setCallState(prev => ({ ...prev, status: 'connected' }));

                    while (iceQueue.current.length > 0) {
                        const candidate = iceQueue.current.shift();
                        if (candidate) {
                            try {
                                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            } catch (e) {
                                console.warn('[WebRTC] Error adding queued ICE:', e);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[WebRTC] Error processing offer:', err);
                    cleanup();
                }
            }
        };
        handleOffer();
    }, [callState.status, callState.otherUser, socket, createPeerConnection, localStream, cleanup, pendingOffer]);

    return (
        <WebRTCContext.Provider value={{
            callState, localStream, remoteStream,
            startCall, acceptCall, rejectCall, endCall,
            toggleMute, toggleVideo, isMuted, isVideoEnabled
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
