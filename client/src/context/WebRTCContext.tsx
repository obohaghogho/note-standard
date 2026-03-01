import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC, { 
    type IAgoraRTCClient, 
    type ICameraVideoTrack, 
    type IMicrophoneAudioTrack
} from 'agora-rtc-sdk-ng';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
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

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';

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

    const client = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const localVideoTrack = useRef<ICameraVideoTrack | null>(null);
    const callTimeoutRef = useRef<any>(null);
    const currentCallStatus = useRef<'idle' | 'calling' | 'incoming' | 'connecting' | 'connected'>('idle');

    useEffect(() => { currentCallStatus.current = callState.status; }, [callState.status]);

    const cleanup = useCallback(async () => {
        console.log('[Agora] Running cleanup');
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }

        if (localAudioTrack.current) {
            localAudioTrack.current.stop();
            localAudioTrack.current.close();
            localAudioTrack.current = null;
        }
        if (localVideoTrack.current) {
            localVideoTrack.current.stop();
            localVideoTrack.current.close();
            localVideoTrack.current = null;
        }

        // Clean up any stray MediaStream tracks to prevent hardware locking and duplicate handles
        setLocalStream((prev) => {
            if (prev) {
                prev.getTracks().forEach((track) => track.stop());
            }
            return null;
        });
        setRemoteStream((prev) => {
            if (prev) {
                prev.getTracks().forEach((track) => track.stop());
            }
            return null;
        });

        if (client.current) {
            try {
                client.current.removeAllListeners();
                await client.current.leave();
                client.current = null;
            } catch (e) {
                console.error('Error leaving Agora channel:', e);
            }
        }

        setCallState({ type: null, status: 'idle', otherUser: null, conversationId: null });
        setIsMuted(false);
        setIsVideoEnabled(true);
    }, []);

    const initClient = useCallback(() => {
        if (!client.current) {
            client.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            
            client.current.on('user-published', async (agoraUser, mediaType) => {
                await client.current!.subscribe(agoraUser, mediaType);
                if (mediaType === 'video') {
                    const videoTrack = agoraUser.videoTrack;
                    if (videoTrack) {
                        const stream = new MediaStream([videoTrack.getMediaStreamTrack()]);
                        setRemoteStream(stream);
                    }
                }
                if (mediaType === 'audio') {
                    agoraUser.audioTrack?.play();
                }
            });

            client.current.on('user-unpublished', (_agoraUser, mediaType) => {
                if (mediaType === 'video') setRemoteStream(null);
            });

            client.current.on('user-left', () => {
                cleanup();
            });
        }
        return client.current;
    }, [cleanup]);

    const startCall = async (otherUserId: string, conversationId: string, type: 'voice' | 'video', name?: string, avatar?: string) => {
        try {
            if (!AGORA_APP_ID) {
                toast.error('Agora App ID not configured.');
                return;
            }

            setCallState({ 
                type, status: 'calling', otherUser: otherUserId, 
                otherUserName: name, otherUserAvatar: avatar, conversationId 
            });

            initClient();
            
            let tracks: any[] = [];
            const audioConfig = { AEC: true, ANS: true, AGC: true };

            if (type === 'video') {
                const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks(audioConfig, undefined);
                localAudioTrack.current = audio;
                localVideoTrack.current = video;
                tracks = [audio, video];
            } else {
                const audio = await AgoraRTC.createMicrophoneAudioTrack(audioConfig);
                localAudioTrack.current = audio;
                tracks = [audio];
            }

            const stream = new MediaStream(tracks.map(t => t.getMediaStreamTrack()));
            setLocalStream(stream);

            if (socket && user) {
                socket.emit('call:init', { to: otherUserId, type, conversationId });
                sendMessage(`Started ${type} call`, 'call').catch(err => console.warn('Failed to log call:', err));
            }

            callTimeoutRef.current = setTimeout(() => {
                if (currentCallStatus.current === 'calling') {
                    toast.error('No answer');
                    cleanup();
                }
            }, 45000);

        } catch (err) {
            console.error('[Agora] startCall failed:', err);
            toast.error('Failed to access media devices');
            cleanup();
        }
    };

    const fetchAgoraToken = async (channelName: string, uid: string | number) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agora-token?channel=${channelName}&uid=${uid}`);
            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error('Failed to fetch Agora token:', error);
            return null;
        }
    };

    const acceptCall = async () => {
        if (!callState.conversationId || !AGORA_APP_ID) return;
        try {
            const agoraClient = initClient();
            
            let tracks: any[] = [];
            const audioConfig = { AEC: true, ANS: true, AGC: true };

            if (callState.type === 'video') {
                const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks(audioConfig, undefined);
                localAudioTrack.current = audio;
                localVideoTrack.current = video;
                tracks = [audio, video];
            } else {
                const audio = await AgoraRTC.createMicrophoneAudioTrack(audioConfig);
                localAudioTrack.current = audio;
                tracks = [audio];
            }

            const stream = new MediaStream(tracks.map(t => t.getMediaStreamTrack()));
            setLocalStream(stream);

            // Fetch token from backend using user.id as UID
            const uid = user?.id || '0';
            const token = await fetchAgoraToken(callState.conversationId, uid);
            if (!token) {
                toast.error('Failed to get security token for call');
                cleanup();
                return;
            }

            await agoraClient.join(AGORA_APP_ID, callState.conversationId, token, uid); 
            await agoraClient.publish(tracks);

            setCallState(prev => ({ ...prev, status: 'connected' }));
            socket?.emit('call:ready', { to: callState.otherUser });
        } catch (err) {
            console.error('[Agora] acceptCall failed:', err);
            toast.error('Failed to join call');
            cleanup();
        }
    };

    const rejectCall = () => {
        socket?.emit('call:end', { to: callState.otherUser, conversationId: callState.conversationId });
        cleanup();
    };

    const endCall = () => {
        socket?.emit('call:end', { to: callState.otherUser, conversationId: callState.conversationId });
        cleanup();
    };

    const toggleMute = () => {
        if (localAudioTrack.current) {
            const nextActive = !isMuted;
            localAudioTrack.current.setEnabled(nextActive);
            setIsMuted(!nextActive);
        }
    };

    const toggleVideo = () => {
        if (localVideoTrack.current) {
            const nextActive = !isVideoEnabled;
            localVideoTrack.current.setEnabled(nextActive);
            setIsVideoEnabled(nextActive);
        }
    };

    useEffect(() => {
        if (!socket || !socketConnected) return;

        const onCallIncoming = (data: any) => {
            if (currentCallStatus.current !== 'idle') {
                socket.emit('call:end', { to: data.from, conversationId: data.conversationId });
                return;
            }
            setCallState({
                type: data.type,
                status: 'incoming',
                otherUser: data.from,
                otherUserName: data.fromName,
                otherUserAvatar: data.fromAvatar,
                conversationId: data.conversationId
            });
        };

        const onRecipientReady = async () => {
            if (currentCallStatus.current === 'calling' && callState.conversationId) {
                if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
                const agoraClient = initClient();
                try {
                    const uid = user?.id || '0';
                    const token = await fetchAgoraToken(callState.conversationId, uid);
                    if (!token) {
                        toast.error('Security token failed');
                        cleanup();
                        return;
                    }

                    await agoraClient.join(AGORA_APP_ID, callState.conversationId, token, uid);
                    
                    const publishedTracks = agoraClient.localTracks;
                    
                    if (localAudioTrack.current && !publishedTracks.includes(localAudioTrack.current)) {
                        await agoraClient.publish(localAudioTrack.current);
                    }
                    if (localVideoTrack.current && callState.type === 'video' && !publishedTracks.includes(localVideoTrack.current)) {
                        await agoraClient.publish(localVideoTrack.current);
                    }
                    setCallState(prev => ({ ...prev, status: 'connected' }));
                } catch (e) {
                    console.error('Agora join failed on ready:', e);
                    cleanup();
                }
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
    }, [socket, socketConnected, callState.conversationId, callState.type, initClient, cleanup]);

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
