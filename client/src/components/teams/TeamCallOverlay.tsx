import React, { useEffect, useRef } from 'react';
import type { ICameraVideoTrack, IAgoraRTCRemoteUser, ILocalVideoTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Loader2 } from 'lucide-react';
import type { JoinState } from '../../hooks/useAgoraCall';

interface TeamCallOverlayProps {
    joinState: JoinState;
    localVideoTrack: ICameraVideoTrack | null;
    remoteUsers: IAgoraRTCRemoteUser[];
    isMuted: boolean;
    isVideoOff: boolean;
    onLeave: () => void;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    teamName: string;
}

const VideoPlayer: React.FC<{ track: ILocalVideoTrack | IRemoteVideoTrack | null, fallbackInitial?: string }> = ({ track, fallbackInitial }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (track && containerRef.current) {
            track.play(containerRef.current);
        }
        return () => {
            // FIX: Only stop playback in this DOM node (removes the <video> element).
            // Do NOT call track.close() here — the hook owns the track lifecycle.
            // Calling close() from inside the render component would kill the track
            // for all other subscribers and prevent it from being re-attached.
            if (track) {
                try { track.stop(); } catch { /* ignore — track may already be closed by the hook */ }
            }
        };
    }, [track]);

    if (!track) {
        return (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                    {fallbackInitial || 'U'}
                </div>
            </div>
        );
    }

    return <div ref={containerRef} className="w-full h-full bg-black" />;
};

export const TeamCallOverlay: React.FC<TeamCallOverlayProps> = ({
    joinState,
    localVideoTrack,
    remoteUsers,
    isMuted,
    isVideoOff,
    onLeave,
    onToggleMute,
    onToggleVideo,
    teamName
}) => {
    if (joinState === 'idle' || joinState === 'error') return null;

    // Grid classes based on participant count
    const totalParticipants = 1 + remoteUsers.length;
    let gridCols = "grid-cols-1";
    if (totalParticipants === 2) gridCols = "grid-cols-1 md:grid-cols-2";
    else if (totalParticipants === 3 || totalParticipants === 4) gridCols = "grid-cols-2";
    else if (totalParticipants > 4) gridCols = "grid-cols-2 md:grid-cols-3";

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <div className="p-4 md:p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10 pointer-events-none">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Users className="text-white" size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{teamName}</h3>
                        <p className="text-blue-300 text-xs font-medium flex items-center gap-1.5">
                            {joinState === 'joining' ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" />
                                    Joining Call...
                                </>
                            ) : (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    {totalParticipants} in call
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {/* Video Grid */}
            <div className="flex-1 w-full p-4 pt-24 pb-28 md:p-12 flex items-center justify-center">
                <div className={`w-full max-w-[1400px] max-h-full grid ${gridCols} gap-4 md:gap-6`}>
                    
                    {/* Local User */}
                    <div className="relative w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl aspect-video">
                        <VideoPlayer track={localVideoTrack} fallbackInitial="Y" />
                        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm font-medium text-white flex items-center gap-2 border border-white/10 z-10">
                            You
                            {isMuted && <MicOff size={14} className="text-red-400" />}
                        </div>
                    </div>

                    {/* Remote Users */}
                    {remoteUsers.map((user) => (
                        <div key={user.uid} className="relative w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl aspect-video">
                            <VideoPlayer track={user.videoTrack || null} fallbackInitial={String(user.uid).charAt(0).toUpperCase()} />
                            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm font-medium text-white flex items-center gap-2 border border-white/10 z-10">
                                {String(user.uid)}
                                {!user.hasAudio && <MicOff size={14} className="text-red-400" />}
                            </div>
                        </div>
                    ))}

                </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 w-full p-6 md:p-8 flex items-center justify-center bg-gradient-to-t from-black to-transparent">
                <div className="flex items-center gap-4 md:gap-6 bg-gray-900/80 backdrop-blur-xl px-6 md:px-8 py-4 rounded-[2rem] border border-white/10 shadow-2xl">
                    <button
                        onClick={onToggleMute}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                            isMuted 
                                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                                : 'bg-gray-800 text-white hover:bg-gray-700'
                        }`}
                        title={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>

                    <button
                        onClick={onToggleVideo}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                            isVideoOff 
                                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                                : 'bg-gray-800 text-white hover:bg-gray-700'
                        }`}
                        title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                    >
                        {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                    </button>

                    <button
                        onClick={onLeave}
                        className="w-16 h-16 rounded-full flex items-center justify-center bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/30 ml-2"
                        title="Leave Call"
                    >
                        <PhoneOff size={26} />
                    </button>
                </div>
            </div>
        </div>
    );
};
