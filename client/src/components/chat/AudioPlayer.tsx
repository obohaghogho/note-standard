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
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        let isMounted = true;
        fetchUrl(path).then(u => {
            if (isMounted) setUrl(u);
        });
        return () => { isMounted = false; };
    }, [path, fetchUrl]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(err => {
                console.error('Playback failed:', err);
            });
        }
        setIsPlaying(!isPlaying);
    };

    const onLoadedMetadata = () => {
        if (audioRef.current) setDuration(audioRef.current.duration);
    };

    const onTimeUpdate = () => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return '0:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (!url) return <div className="p-2 animate-pulse bg-white/5 rounded-lg w-full h-12"></div>;

    return (
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10 w-full max-w-sm">
            <audio 
                ref={audioRef} 
                src={url} 
                onLoadedMetadata={onLoadedMetadata} 
                onTimeUpdate={onTimeUpdate} 
                onEnded={() => setIsPlaying(false)}
            />
            <button 
                type="button"
                onClick={togglePlay} 
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-400 transition-colors text-white shadow-lg"
            >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
            </button>
            <div className="flex-1 flex flex-col gap-1">
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden relative">
                    <div 
                        className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-100" 
                        style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                    />
                </div>
                <div className="flex justify-between text-[10px] font-medium opacity-60">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
            <div className="flex-shrink-0">
                <Mic size={14} className="opacity-40" />
            </div>
        </div>
    );
};
