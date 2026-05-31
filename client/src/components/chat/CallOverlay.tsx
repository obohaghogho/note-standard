import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Video, Mic, MicOff, VideoOff, Volume2, PhoneMissed } from 'lucide-react';
import SecureImage from '../common/SecureImage';

interface CallOverlayProps {
    callState: {
        type: 'voice' | 'video' | null;
        status: 'idle' | 'calling' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting';
        connectedAt?: number | null;
    };
    acceptCall: () => void;
    rejectCall: () => void;
    endCall: () => void;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    toggleMute: () => void;
    toggleVideo: () => void;
    isMuted: boolean;
    isVideoEnabled: boolean;
    otherUserName: string;
    otherUserAvatar?: string | null;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
    callState, acceptCall, rejectCall, endCall,
    localStream, remoteStream, toggleMute, toggleVideo,
    isMuted, isVideoEnabled, otherUserName, otherUserAvatar,
}) => {
    const [timer, setTimer] = useState('00:00');
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const localVideoRef  = useRef<HTMLVideoElement>(null);

    // ── Call timer ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (callState.status !== 'connected' || !callState.connectedAt) { setTimer('00:00'); return; }
        const tick = () => {
            const elapsed = Math.floor((Date.now() - (callState.connectedAt || 0)) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            setTimer(`${m}:${s}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [callState.status, callState.connectedAt]);

    const isVideoCall = callState.type === 'video';

    // ── Attach remote stream to media elements ────────────────────────────────
    // FIX: Separate audio and video tracks into dedicated elements.
    // Also handle late-arriving tracks via onaddtrack — this fixes the black video bug
    // where the video track arrives after the audio track and the video element already
    // has its srcObject set to an audio-only stream.
    const applyRemoteStream = useCallback(() => {
        if (!remoteStream) {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
            return;
        }

        // Audio: always use dedicated <audio> element
        if (remoteAudioRef.current) {
            const audioTracks = remoteStream.getAudioTracks();
            if (audioTracks.length > 0) {
                remoteAudioRef.current.srcObject = new MediaStream(audioTracks);
                remoteAudioRef.current.play().catch(() => {
                    const retry = () => { remoteAudioRef.current?.play().catch(() => {}); window.removeEventListener('click', retry); };
                    window.addEventListener('click', retry, { once: true });
                });
            }
        }

        // Video: only for video calls
        if (isVideoCall && remoteVideoRef.current) {
            const videoTracks = remoteStream.getVideoTracks();
            if (videoTracks.length > 0) {
                remoteVideoRef.current.srcObject = new MediaStream(videoTracks);
                remoteVideoRef.current.play().catch(() => {});
            }
        }
    }, [remoteStream, isVideoCall]);

    useEffect(() => {
        applyRemoteStream();
        // FIX: Listen for late-arriving tracks (e.g. video arrives after audio)
        if (remoteStream) {
            remoteStream.onaddtrack = applyRemoteStream;
            return () => { remoteStream.onaddtrack = null; };
        }
    }, [remoteStream, applyRemoteStream]);

    // ── Local video preview ───────────────────────────────────────────────────
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(() => {});
        }
    }, [localStream]);

    const statusLabel = () => {
        switch (callState.status) {
            case 'connected':    return callState.type === 'voice' ? 'In Voice Call' : 'Video Connected';
            case 'reconnecting': return 'Reconnecting...';
            case 'connecting':   return 'Connecting...';
            case 'calling':      return 'Calling...';
            case 'ringing':      return 'Ringing...';
            case 'incoming':     return `Incoming ${callState.type === 'video' ? 'Video' : 'Voice'} Call`;
            default:             return 'Connecting...';
        }
    };

    const showRemoteVideo = isVideoCall && !!remoteStream && remoteStream.getVideoTracks().length > 0;
    const avatarLetter    = otherUserName?.charAt(0).toUpperCase() || '?';
    const isIncoming      = callState.status === 'incoming';
    const isWaiting       = ['calling', 'ringing', 'connecting'].includes(callState.status);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

            {/* Call Card */}
            <div
                className="relative w-full h-full md:w-[420px] md:h-auto md:max-h-[90vh] md:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
                style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0d0d2b 100%)' }}
            >
                {/* Hidden audio: always present, receives all remote audio */}
                <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />

                {/* Remote video — always in DOM so ref is always valid */}
                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${showRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                />

                {/* Overlay gradient on top of remote video */}
                {showRemoteVideo && (
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />
                )}

                {/* Main Content */}
                <div className="relative flex flex-col h-full min-h-screen md:min-h-0 md:h-[620px]">

                    {/* Top: Status bar */}
                    <div className="flex items-center justify-between px-6 pt-12 md:pt-8 pb-4">
                        <div className="flex items-center gap-2">
                            {isVideoCall
                                ? <Video size={16} className="text-violet-400" />
                                : <Volume2 size={16} className="text-violet-400" />}
                            <span className="text-xs font-medium text-violet-300 uppercase tracking-widest">
                                {isVideoCall ? 'Video' : 'Voice'} Call
                            </span>
                        </div>
                        {callState.status === 'connected' && (
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-sm font-mono text-green-400 tabular-nums">{timer}</span>
                            </div>
                        )}
                    </div>

                    {/* Center: Avatar + name + status */}
                    <div className={`flex-1 flex flex-col items-center justify-center gap-5 px-8 ${showRemoteVideo ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

                        {/* Avatar with animated rings */}
                        <div className="relative flex items-center justify-center">
                            {(isIncoming || isWaiting) && (
                                <>
                                    <span className="absolute inline-flex h-36 w-36 rounded-full bg-violet-500/20 animate-ping" />
                                    <span className="absolute inline-flex h-44 w-44 rounded-full bg-violet-500/10 animate-ping" style={{ animationDelay: '0.3s' }} />
                                </>
                            )}
                            <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 shadow-2xl"
                                style={{ borderColor: 'rgba(139,92,246,0.6)', boxShadow: '0 0 40px rgba(139,92,246,0.4)' }}>
                                {otherUserAvatar ? (
                                    <SecureImage src={otherUserAvatar} alt={otherUserName} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                                        <span className="text-4xl font-bold text-white">{avatarLetter}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-bold text-white tracking-tight">{otherUserName}</h2>
                            <p className={`text-sm font-medium ${
                                callState.status === 'reconnecting' ? 'text-yellow-400' :
                                callState.status === 'connected'    ? 'text-green-400'  : 'text-violet-300'
                            } ${isWaiting ? 'animate-pulse' : ''}`}>
                                {statusLabel()}
                            </p>
                        </div>
                    </div>

                    {/* Local PiP — video calls only */}
                    {isVideoCall && (
                        <div className="absolute top-20 right-5 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl z-10"
                            style={{ background: '#111' }}>
                            {localStream && (
                                <video ref={localVideoRef} autoPlay muted playsInline
                                    className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`} />
                            )}
                            {!isVideoEnabled && (
                                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                    <VideoOff size={22} className="text-gray-500" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom controls */}
                    <div className="pb-12 md:pb-8 px-8">

                        {/* Incoming call controls */}
                        {isIncoming && (
                            <div className="flex items-center justify-around">
                                <div className="flex flex-col items-center gap-3">
                                    <button
                                        id="call-decline-btn"
                                        onClick={rejectCall}
                                        className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
                                        style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 8px 32px rgba(239,68,68,0.5)' }}
                                    >
                                        <PhoneMissed size={30} className="text-white" />
                                    </button>
                                    <span className="text-sm text-red-400 font-medium">Decline</span>
                                </div>
                                <div className="flex flex-col items-center gap-3">
                                    <button
                                        id="call-accept-btn"
                                        onClick={acceptCall}
                                        className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
                                        style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 8px 32px rgba(34,197,94,0.5)' }}
                                    >
                                        <Phone size={30} className="text-white" />
                                    </button>
                                    <span className="text-sm text-green-400 font-medium">Accept</span>
                                </div>
                            </div>
                        )}

                        {/* Active call controls */}
                        {!isIncoming && (
                            <div className="flex items-center justify-center gap-5">
                                {/* Mute */}
                                <button
                                    id="call-mute-btn"
                                    onClick={toggleMute}
                                    className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
                                    style={{
                                        background: isMuted
                                            ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                            : 'rgba(255,255,255,0.12)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                    }}
                                >
                                    {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                                </button>

                                {/* End call */}
                                <button
                                    id="call-end-btn"
                                    onClick={endCall}
                                    className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
                                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 8px 32px rgba(239,68,68,0.5)' }}
                                >
                                    <Phone size={30} className="text-white rotate-[135deg]" />
                                </button>

                                {/* Video toggle (video calls only) */}
                                {isVideoCall && (
                                    <button
                                        id="call-video-btn"
                                        onClick={toggleVideo}
                                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
                                        style={{
                                            background: !isVideoEnabled
                                                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                                : 'rgba(255,255,255,0.12)',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                        }}
                                    >
                                        {isVideoEnabled ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
