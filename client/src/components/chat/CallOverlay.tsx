import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, Mic, MicOff, VideoOff } from 'lucide-react';
import SecureImage from '../common/SecureImage';

interface CallOverlayProps {
    callState: {
        type: 'voice' | 'video' | null;
        // FIX: 'connecting' added to match WebRTCContext state
        status: 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected';
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
    isMuted, isVideoEnabled, otherUserName, otherUserAvatar 
}) => {
    const [timer, setTimer] = useState('00:00');

    useEffect(() => {
        if (callState.status !== 'connected' || !callState.connectedAt) {
            setTimer('00:00');
            return;
        }

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - (callState.connectedAt || 0)) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            setTimer(`${mins}:${secs}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [callState.status, callState.connectedAt]);

    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);

    // FIX: Use reference equality (srcObject !== stream) instead of truthiness check
    // so the element re-binds correctly if the stream object is replaced
    useEffect(() => {
        if (callState.type === 'video') {
            if (remoteVideoRef.current && remoteStream) {
                if (remoteVideoRef.current.srcObject !== remoteStream) {
                    remoteVideoRef.current.srcObject = remoteStream;
                    remoteVideoRef.current.play().catch(e => console.error('Remote video play err:', e));
                }
            }
        } else {
            // Voice call: bind to audio element for correct OS-level media routing
            if (remoteAudioRef.current && remoteStream) {
                if (remoteAudioRef.current.srcObject !== remoteStream) {
                    remoteAudioRef.current.srcObject = remoteStream;
                    remoteAudioRef.current.play().catch(e => console.error('Remote audio play err:', e));
                }
            }
        }
    }, [remoteStream, callState.type]);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            // FIX: same reference equality fix for local preview
            if (localVideoRef.current.srcObject !== localStream) {
                localVideoRef.current.srcObject = localStream;
                localVideoRef.current.play().catch(e => console.error('Local play err:', e));
            }
        }
    }, [localStream]);

    const statusLabel = () => {
        switch (callState.status) {
            case 'connected':   return callState.type === 'voice' ? 'In Voice Call' : 'Video Connected';
            case 'connecting':  return 'Connecting...';
            case 'calling':     return 'Ringing...';
            case 'incoming':    return `${callState.type === 'video' ? 'Video' : 'Voice'} Call Incoming`;
            default:            return 'Connecting...';
        }
    };

    const isVideoCall = callState.type === 'video';

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
            <div className="relative w-full h-full md:w-[90vw] md:h-[80vh] bg-gray-900 md:rounded-3xl overflow-hidden shadow-2xl border border-white/5">
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    {remoteStream && isVideoCall ? (
                        <video 
                            ref={remoteVideoRef} 
                            autoPlay 
                            playsInline
                            className="w-full h-full object-cover" 
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-6">
                            {/* FIX: Audio element always rendered for voice calls so audio routes correctly */}
                            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                            <div className="relative">
                                <div className="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping"></div>
                                <div className="absolute -inset-8 bg-blue-500/10 rounded-full animate-pulse"></div>
                                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl font-bold border-4 border-white/10 shadow-2xl overflow-hidden">
                                    {otherUserAvatar ? (
                                        <SecureImage src={otherUserAvatar} alt={otherUserName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white">{otherUserName?.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-2xl font-bold text-white mb-2">{otherUserName}</h3>
                                {callState.status === 'connected' && (
                                    <div className="text-blue-400 font-mono text-lg mb-2 tabular-nums">
                                        {timer}
                                    </div>
                                )}
                                <p className="text-blue-400 font-medium animate-pulse">
                                    {statusLabel()}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* FIX: Only show local video PiP for video calls */}
                {isVideoCall && (
                    <div className="absolute top-8 right-8 w-40 h-56 md:w-48 md:h-64 bg-gray-950 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-10 transition-all">
                        {localStream ? (
                            <video 
                                ref={localVideoRef} 
                                autoPlay 
                                muted 
                                playsInline
                                className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`} 
                            />
                        ) : null}
                        {!isVideoEnabled && (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                                    <VideoOff size={20} className="text-gray-500" />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Control Buttons */}
                <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-8 z-20">
                    {callState.status === 'incoming' ? (
                        <div className="flex gap-12">
                            <div className="flex flex-col items-center gap-3">
                                <button 
                                    onClick={acceptCall} 
                                    className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-all hover:scale-110 shadow-xl shadow-green-500/30"
                                >
                                    <Phone size={32} />
                                </button>
                                <span className="text-sm font-medium text-green-400">Accept</span>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <button 
                                    onClick={rejectCall} 
                                    className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all hover:scale-110 shadow-xl shadow-red-500/30"
                                >
                                    <Phone size={32} className="rotate-[135deg]" />
                                </button>
                                <span className="text-sm font-medium text-red-400">Decline</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-6 bg-black/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-3xl">
                            <button 
                                onClick={toggleMute} 
                                className={`p-5 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`} 
                                title={isMuted ? "Unmute" : "Mute"}
                            >
                                {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
                            </button>
                            
                            <button 
                                onClick={endCall} 
                                className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-all hover:scale-110 shadow-2xl shadow-red-500/40 transform active:scale-95"
                            >
                                <Phone size={34} className="rotate-[135deg]" />
                            </button>
                            
                            {isVideoCall && (
                                <button 
                                    onClick={toggleVideo} 
                                    className={`p-5 rounded-full transition-all ${!isVideoEnabled ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`} 
                                    title={isVideoEnabled ? "Turn Camera Off" : "Turn Camera On"}
                                >
                                    {isVideoEnabled ? <Video size={26} /> : <VideoOff size={26} />}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
