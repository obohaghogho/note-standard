import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface AudioPlayerProps {
    path: string;
    fetchUrl: (path: string) => Promise<string | null>;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ path, fetchUrl }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const durationHackAppliedRef = useRef(false);

    useEffect(() => {
        if (!path) return;
        let isMounted = true;
        setError(null);
        fetchUrl(path).then(u => {
            if (isMounted) setUrl(u);
        }).catch(() => {
            if (isMounted) setError('Failed to load audio');
        });
        return () => { isMounted = false; };
    }, [path, fetchUrl]);

    const onError = () => {
        console.error('[AudioPlayer] Error loading audio:', audioRef.current?.error);
        setError('Unsupported format or loading error');
    };

    const togglePlay = () => {
        if (!audioRef.current || error) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(err => {
                console.error('Playback failed:', err);
                setError('Playback failed');
            });
        }
        setIsPlaying(!isPlaying);
    };

    const onLoadedMetadata = () => {
        if (!audioRef.current) return;
        const d = audioRef.current.duration;
        
        // Fix for WebM missing duration (returns Infinity in browsers)
        if (d === Infinity) {
            try {
                audioRef.current.currentTime = 1e101;
                audioRef.current.ontimeupdate = () => {
                    if (audioRef.current) {
                        audioRef.current.ontimeupdate = null;
                        const realDuration = audioRef.current.duration;
                        setDuration(realDuration);
                        audioRef.current.currentTime = 0;
                        durationHackAppliedRef.current = true;
                    }
                };
            } catch (e) {
                console.warn('[AudioPlayer] Duration hack failed:', e);
            }
        } else {
            setDuration(d);
        }
    };

    const onTimeUpdate = () => {
        if (audioRef.current && (!durationHackAppliedRef.current || audioRef.current.currentTime < 1e100)) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const formatTime = (time: number) => {
        if (isNaN(time) || !isFinite(time)) return '0:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (error) {
        return (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg text-red-400 text-xs w-full max-w-sm">
                <Mic size={14} className="flex-shrink-0" />
                <span className="flex-1 truncate">{error}</span>
                <a href={url || '#'} download className="text-blue-400 underline flex-shrink-0">Download</a>
            </div>
        );
    }

    if (!url) return <div className="p-2 animate-pulse bg-white/5 rounded-lg w-full min-w-[200px] h-12"></div>;

    return (
        <div className="flex items-center gap-3 bg-gradient-to-r from-gray-800/80 to-gray-900/80 backdrop-blur-xl p-3.5 rounded-[20px] border border-white/10 w-full max-w-sm shadow-2xl group/audio overflow-hidden relative">
            {/* Animated background glow */}
            {isPlaying && (
                <div className="absolute inset-0 bg-blue-500/5 animate-pulse transition-opacity duration-1000" />
            )}
            
            <audio 
                ref={audioRef} 
                src={url} 
                onLoadedMetadata={onLoadedMetadata} 
                onTimeUpdate={onTimeUpdate} 
                onEnded={() => setIsPlaying(false)}
                onError={onError}
                preload="metadata"
            />
            
            <button 
                type="button"
                onClick={togglePlay} 
                className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg ${
                    isPlaying 
                    ? 'bg-white text-blue-600 scale-105' 
                    : 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105'
                }`}
            >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-1" fill="currentColor" />}
            </button>
            
            <div className="flex-1 flex flex-col gap-2 min-w-0">
                {/* Simulated Waveform / Progress */}
                <div className="relative h-6 flex items-center gap-[2px] px-1">
                    {[...Array(20)].map((_, i) => {
                        const progress = (currentTime / duration) * 100 || 0;
                        const barProgress = (i / 20) * 100;
                        const isActive = barProgress <= progress;
                        const height = 30 + Math.sin(i * 0.8) * 40 + Math.random() * 20; // Pseudo random height
                        
                        return (
                            <div 
                                key={i}
                                className={`flex-1 rounded-full transition-all duration-300 ${
                                    isActive ? 'bg-blue-400' : 'bg-gray-600'
                                } ${isPlaying && isActive ? 'animate-waveform' : ''}`}
                                style={{ 
                                    height: `${isActive ? height : 30}%`,
                                    opacity: isActive ? 1 : 0.4,
                                    animationDelay: `${i * 0.05}s`
                                }}
                            />
                        );
                    })}
                    
                    {/* Invisible Range Input for seeking */}
                    <input 
                        id="audio-seek-range"
                        name="seek"
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={(e) => {
                            if (audioRef.current) {
                                audioRef.current.currentTime = parseFloat(e.target.value);
                                setCurrentTime(audioRef.current.currentTime);
                            }
                        }}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                        aria-label="Seek audio"
                    />
                </div>
                
                <div className="flex justify-between text-[10px] font-bold tracking-tight opacity-50 px-1">
                    <span className={isPlaying ? 'text-blue-300' : 'text-white'}>{formatTime(currentTime)}</span>
                    <span className="text-white">{formatTime(duration)}</span>
                </div>
            </div>
            
            <div className="flex-shrink-0 pr-1">
                <div className={`p-2 rounded-full transition-colors ${isPlaying ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500'}`}>
                    <Mic size={14} />
                </div>
            </div>

            <style>{`
                @keyframes waveform {
                    0%, 100% { transform: scaleY(1); }
                    50% { transform: scaleY(1.5); }
                }
                .animate-waveform {
                    animation: waveform 1s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};
