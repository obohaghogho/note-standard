import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { 
    IAgoraRTCClient, 
    IAgoraRTCRemoteUser, 
    ICameraVideoTrack, 
    IMicrophoneAudioTrack
} from 'agora-rtc-sdk-ng';
import api from '../api/axiosInstance';
import toast from 'react-hot-toast';

export type JoinState = 'idle' | 'joining' | 'connected' | 'error';

export const useAgoraCall = () => {
    const [joinState, setJoinState] = useState<JoinState>('idle');
    const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
    const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
    const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const clientRef = useRef<IAgoraRTCClient | null>(null);
    // FIX: Track refs alongside state so leaveCall/joinCall error-path always
    // has access to the latest track objects without stale closures.
    const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
    const videoTrackRef = useRef<ICameraVideoTrack | null>(null);

    // Initialize client once and clean up fully on unmount.
    useEffect(() => {
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;
        
        const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
            if (!clientRef.current) return;
            await clientRef.current.subscribe(user, mediaType);
            if (mediaType === 'audio') {
                user.audioTrack?.play();
            }
            setRemoteUsers(Array.from(clientRef.current.remoteUsers));
        };

        const handleUserUnpublished = () => {
            if (!clientRef.current) return;
            setRemoteUsers(Array.from(clientRef.current.remoteUsers));
        };

        const handleUserJoined = () => {
            if (!clientRef.current) return;
            setRemoteUsers(Array.from(clientRef.current.remoteUsers));
        };

        const handleUserLeft = () => {
            if (!clientRef.current) return;
            setRemoteUsers(Array.from(clientRef.current.remoteUsers));
        };

        client.on('user-published', handleUserPublished);
        client.on('user-unpublished', handleUserUnpublished);
        client.on('user-joined', handleUserJoined);
        client.on('user-left', handleUserLeft);

        return () => {
            // Full cleanup when the provider unmounts (e.g. navigating away)
            client.removeAllListeners();
            if (audioTrackRef.current) {
                audioTrackRef.current.stop();
                audioTrackRef.current.close();
                audioTrackRef.current = null;
            }
            if (videoTrackRef.current) {
                videoTrackRef.current.stop();
                videoTrackRef.current.close();
                videoTrackRef.current = null;
            }
            // Leave the channel silently on unmount — don't crash if already left
            client.leave().catch(() => {});
        };
    }, []);

    const joinCall = useCallback(async (channelName: string, uid: string) => {
        const client = clientRef.current;
        if (!client) return;
        // Prevent double-joining if already in a call
        if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING') return;

        let audioTrack: IMicrophoneAudioTrack | null = null;
        let videoTrack: ICameraVideoTrack | null = null;
        
        try {
            setJoinState('joining');
            
            // Fetch token from backend
            // The axios instance already prefixes /api automatically
            const response = await api.get(`/agora/token?channel=${encodeURIComponent(channelName)}&uid=${encodeURIComponent(uid)}`);
            const { token, uid: numericUid } = response.data;
            const appId = import.meta.env.VITE_AGORA_APP_ID;

            if (!appId) {
                throw new Error('Missing VITE_AGORA_APP_ID in environment variables. Add it to client/.env');
            }

            // Join the channel
            await client.join(appId, channelName, token, numericUid);

            // Create local tracks AFTER joining so any failure cleans up properly
            [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();

            // Store in refs immediately so error-path cleanup can access them
            audioTrackRef.current = audioTrack;
            videoTrackRef.current = videoTrack;

            setLocalAudioTrack(audioTrack);
            setLocalVideoTrack(videoTrack);

            await client.publish([audioTrack, videoTrack]);
            
            setJoinState('connected');
        } catch (error) {
            console.error('[Agora] Failed to join channel:', error);
            const errMsg = error instanceof Error ? error.message : 'Failed to join the call';
            toast.error(errMsg);

            // Cleanup any tracks that were created before the failure
            if (audioTrackRef.current) { audioTrackRef.current.stop(); audioTrackRef.current.close(); audioTrackRef.current = null; }
            if (videoTrackRef.current) { videoTrackRef.current.stop(); videoTrackRef.current.close(); videoTrackRef.current = null; }
            setLocalAudioTrack(null);
            setLocalVideoTrack(null);

            // Leave channel if we partially joined
            await client.leave().catch(() => {});

            setJoinState('idle');
        }
    }, []);

    // FIX: leaveCall reads from refs, not state — this gives it a stable identity
    // (empty deps array) and avoids stale closure issues on the error path.
    const leaveCall = useCallback(async () => {
        // Stop and close local tracks via refs (always up-to-date)
        if (audioTrackRef.current) {
            audioTrackRef.current.stop();
            audioTrackRef.current.close();
            audioTrackRef.current = null;
        }
        if (videoTrackRef.current) {
            videoTrackRef.current.stop();
            videoTrackRef.current.close();
            videoTrackRef.current = null;
        }
        
        if (clientRef.current) {
            try { await clientRef.current.unpublish(); } catch { /* ignore if already unpublished */ }
            await clientRef.current.leave().catch(() => {});
        }
        
        setLocalAudioTrack(null);
        setLocalVideoTrack(null);
        setRemoteUsers([]);
        setJoinState('idle');
        setIsMuted(false);
        setIsVideoOff(false);
    }, []);

    // FIX: Use refs for toggle operations too, for stable callbacks
    const toggleMute = useCallback(async () => {
        if (audioTrackRef.current) {
            const nextMuted = !isMuted;
            await audioTrackRef.current.setMuted(nextMuted);
            setIsMuted(nextMuted);
        }
    }, [isMuted]);

    const toggleVideo = useCallback(async () => {
        if (videoTrackRef.current) {
            const nextVideoOff = !isVideoOff;
            await videoTrackRef.current.setMuted(nextVideoOff);
            setIsVideoOff(nextVideoOff);
        }
    }, [isVideoOff]);

    return {
        joinState,
        localVideoTrack,
        localAudioTrack,
        remoteUsers,
        isMuted,
        isVideoOff,
        joinCall,
        leaveCall,
        toggleMute,
        toggleVideo
    };
};
