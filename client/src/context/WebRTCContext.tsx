import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Peer, { type MediaConnection } from 'peerjs';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { API_URL } from '../lib/api';
import { CallOverlay } from '../components/chat/CallOverlay';
import toast from 'react-hot-toast';

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

/**
 * Derive the PeerJS signaling server host from the API_URL.
 * In development this is typically localhost:5000.
 * In production this is the same host as the backend.
 */
function getPeerConfig() {
    try {
        const url = new URL(API_URL);
        return {
            host: url.hostname,
            port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
            path: '/peerjs',
            secure: url.protocol === 'https:',
        };
    } catch {
        return { host: 'localhost', port: 5000, path: '/peerjs', secure: false };
    }
}

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

    const peerRef = useRef<Peer | null>(null);
    const mediaConnectionRef = useRef<MediaConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const callTimeoutRef = useRef<any>(null);
    const currentCallStatus = useRef<'idle' | 'calling' | 'incoming' | 'connecting' | 'connected'>('idle');
    // Store incoming call data so acceptCall can access it
    const pendingCallRef = useRef<{ from: string; peerId: string; type: 'voice' | 'video' } | null>(null);

    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);

    // ─── Initialize PeerJS ────────────────────────────────────────
    useEffect(() => {
        if (!user?.id) return;

        // PeerJS peer IDs cannot contain certain characters –
        // Supabase UUIDs use hyphens, so we replace them.
        const peerId = `ns_${user.id.replace(/-/g, '_')}`;
        const config = getPeerConfig();

        const peer = new Peer(peerId, {
            ...config,
            debug: import.meta.env.DEV ? 2 : 0,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            },
        });

        peer.on('open', (id) => {
            console.log('[PeerJS] Connected with peer ID:', id);
        });

        // Handle incoming PeerJS media calls
        peer.on('call', (call) => {
            console.log('[PeerJS] Incoming media call from:', call.peer);
            mediaConnectionRef.current = call;

            call.on('stream', (remote) => {
                console.log('[PeerJS] Got remote stream');
                setRemoteStream(remote);
                setCallState(prev => ({ ...prev, status: 'connected' }));
            });

            call.on('close', () => {
                console.log('[PeerJS] Call closed by remote');
                cleanup();
            });

            call.on('error', (err) => {
                console.error('[PeerJS] Call error:', err);
                toast.error('Call connection error');
                cleanup();
            });
        });

        peer.on('error', (err) => {
            console.error('[PeerJS] Peer error:', err);
            if (err.type === 'unavailable-id') {
                console.warn('[PeerJS] Peer ID already taken, reconnecting...');
            }
        });

        peerRef.current = peer;

        return () => {
            peer.destroy();
            peerRef.current = null;
        };
    }, [user?.id]);

    // ─── Cleanup ──────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        console.log('[PeerJS] Running cleanup');
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }

        if (mediaConnectionRef.current) {
            mediaConnectionRef.current.close();
            mediaConnectionRef.current = null;
        }

        // Stop all local media tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        setLocalStream(null);
        setRemoteStream(null);
        pendingCallRef.current = null;
        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
    }, []);

    // ─── Start Call ───────────────────────────────────────────────
    const startCall = async (otherUserId: string, conversationId: string, type: 'voice' | 'video', name?: string, avatar?: string) => {
        try {
            if (!peerRef.current) {
                toast.error('Connection not ready. Please try again.');
                return;
            }

            setCallState({
                type, status: 'calling', otherUser: otherUserId,
                otherUserName: name, otherUserAvatar: avatar, conversationId
            });

            // Acquire local media
            const constraints: MediaStreamConstraints = {
                audio: true,
                video: type === 'video',
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);

            // Notify the other user via Socket.io (ringing)
            const myPeerId = peerRef.current.id;
            if (socket && user) {
                socket.emit('call:init', { to: otherUserId, type, conversationId, peerId: myPeerId });
                sendMessage(`Started ${type} call`, 'call').catch(err => console.warn('Failed to log call:', err));
            }

            // Auto-timeout after 45 seconds
            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    socket?.emit('call:end', { to: otherUserId, conversationId });
                    cleanup();
                }
            }, 45000);

        } catch (err) {
            console.error('[PeerJS] startCall failed:', err);
            toast.error('Failed to access media devices');
            cleanup();
        }
    };

    // ─── Accept Call ──────────────────────────────────────────────
    const acceptCall = async () => {
        try {
            if (!peerRef.current || !pendingCallRef.current) {
                toast.error('Call data missing');
                cleanup();
                return;
            }

            const { peerId: callerPeerId, type } = pendingCallRef.current;

            // Acquire local media
            const constraints: MediaStreamConstraints = {
                audio: true,
                video: type === 'video',
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);

            // Answer the existing incoming PeerJS media call if it already arrived
            if (mediaConnectionRef.current) {
                mediaConnectionRef.current.answer(stream);
                setCallState(prev => ({ ...prev, status: 'connecting' }));
            }

            // Also tell the caller we're ready so they can initiate PeerJS call
            socket?.emit('call:ready', { to: callState.otherUser, peerId: peerRef.current.id });

        } catch (err) {
            console.error('[PeerJS] acceptCall failed:', err);
            toast.error('Failed to join call');
            cleanup();
        }
    };

    // ─── Reject / End ─────────────────────────────────────────────
    const rejectCall = () => {
        socket?.emit('call:end', { to: callState.otherUser, conversationId: callState.conversationId });
        cleanup();
    };

    const endCall = () => {
        socket?.emit('call:end', { to: callState.otherUser, conversationId: callState.conversationId });
        cleanup();
    };

    // ─── Toggle Controls ──────────────────────────────────────────
    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = isMuted; // flip
            });
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(track => {
                track.enabled = !isVideoEnabled; // flip
            });
            setIsVideoEnabled(!isVideoEnabled);
        }
    };

    // ─── Socket.io Listeners ──────────────────────────────────────
    useEffect(() => {
        if (!socket || !socketConnected) return;

        // Callee receives the ring notification
        const onCallIncoming = (data: any) => {
            if (currentCallStatus.current !== 'idle') {
                socket.emit('call:end', { to: data.from, conversationId: data.conversationId });
                return;
            }
            // Store the caller's peerId so we can connect when accepted
            pendingCallRef.current = { from: data.from, peerId: data.peerId, type: data.type };
            setCallState({
                type: data.type,
                status: 'incoming',
                otherUser: data.from,
                otherUserName: data.fromName,
                otherUserAvatar: data.fromAvatar,
                conversationId: data.conversationId,
            });
        };

        // Caller receives "ready" → initiate PeerJS media call to the callee
        const onRecipientReady = (data: any) => {
            if (currentCallStatus.current === 'calling' && peerRef.current && localStreamRef.current) {
                if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

                const calleePeerId = data.peerId || `ns_${data.from?.replace(/-/g, '_')}`;
                console.log('[PeerJS] Calling peer:', calleePeerId);

                const call = peerRef.current.call(calleePeerId, localStreamRef.current);
                if (!call) {
                    toast.error('Failed to establish connection');
                    cleanup();
                    return;
                }

                mediaConnectionRef.current = call;
                setCallState(prev => ({ ...prev, status: 'connecting' }));

                call.on('stream', (remote) => {
                    console.log('[PeerJS] Got remote stream from callee');
                    setRemoteStream(remote);
                    setCallState(prev => ({ ...prev, status: 'connected' }));
                });

                call.on('close', () => cleanup());
                call.on('error', (err) => {
                    console.error('[PeerJS] Call error:', err);
                    toast.error('Call connection failed');
                    cleanup();
                });
            }
        };

        const onCallEnded = () => {
            cleanup();
        };

        socket.on('call:incoming', onCallIncoming);
        socket.on('call:ready', onRecipientReady);
        socket.on('call:ended', onCallEnded);

        return () => {
            socket.off('call:incoming', onCallIncoming);
            socket.off('call:ready', onRecipientReady);
            socket.off('call:ended', onCallEnded);
        };
    }, [socket, socketConnected, cleanup]);

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
