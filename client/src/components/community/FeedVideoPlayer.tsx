import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { feedVideoCoordinator } from '../../utils/feedVideoCoordinator';

interface FeedVideoPlayerProps {
  src: string;
  postId: string;
  poster?: string;
  className?: string;
  containerClassName?: string;
  style?: React.CSSProperties;
}

export const FeedVideoPlayer: React.FC<FeedVideoPlayerProps> = ({
  src,
  postId,
  poster,
  className = 'w-full h-auto max-h-[min(54svh,500px)] object-cover block mx-auto bg-transparent',
  containerClassName,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(() => feedVideoCoordinator.userPrefersMuted);
  const [showIndicator, setShowIndicator] = useState<null | 'play' | 'pause'>(null);
  const indicatorTimeoutRef = useRef<any>(null);

  // Register with FeedVideoCoordinator & observe intersection for autoplay / auto-stop
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    // Set initial mute state from coordinator preference
    video.muted = feedVideoCoordinator.userPrefersMuted;
    setIsMuted(video.muted);

    feedVideoCoordinator.register(postId, video, container);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
          feedVideoCoordinator.updateVisibility(postId, ratio);
        }
      },
      {
        threshold: [0, 0.15, 0.25, 0.4, 0.6, 0.8, 1.0],
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      feedVideoCoordinator.unregister(postId);
    };
  }, [postId]);

  const handlePlay = useCallback(() => {
    if (videoRef.current) {
      feedVideoCoordinator.notifyPlay(videoRef.current, postId);
    }
  }, [postId]);

  const handlePause = useCallback(() => {
    if (videoRef.current) {
      feedVideoCoordinator.notifyPause(videoRef.current);
    }
  }, []);

  const handleVolumeChange = useCallback(() => {
    if (videoRef.current) {
      setIsMuted(videoRef.current.muted);
    }
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!videoRef.current) return;

    const nextMuted = !videoRef.current.muted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    feedVideoCoordinator.setMutedPreference(nextMuted);

    // If unmuting while paused, resume playback
    if (!nextMuted && videoRef.current.paused) {
      feedVideoCoordinator.playVideo(videoRef.current, postId);
    }
  }, [postId]);

  const togglePlayPause = useCallback((e: React.MouseEvent) => {
    // Only toggle if clicked directly on video body, not on native controls
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() !== 'video') return;

    e.stopPropagation();
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      feedVideoCoordinator.playVideo(videoRef.current, postId);
      setShowIndicator('play');
    } else {
      videoRef.current.pause();
      setShowIndicator('pause');
    }

    if (indicatorTimeoutRef.current) clearTimeout(indicatorTimeoutRef.current);
    indicatorTimeoutRef.current = setTimeout(() => {
      setShowIndicator(null);
    }, 600);
  }, [postId]);

  return (
    <div
      ref={containerRef}
      className={containerClassName || "relative w-full overflow-hidden bg-transparent flex items-center justify-center group/videoplayer select-none"}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        loop
        preload="metadata"
        className={className}
        style={style}
        onPlay={handlePlay}
        onPause={handlePause}
        onVolumeChange={handleVolumeChange}
        onClick={togglePlayPause}
      />

      {/* Floating Mute/Unmute quick toggle button */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center shadow-lg transition-transform active:scale-90 border border-white/10"
      >
        {isMuted ? (
          <VolumeX size={16} className="text-white/90" />
        ) : (
          <Volume2 size={16} className="text-white" />
        )}
      </button>

      {/* Brief Play/Pause tap feedback overlay */}
      {showIndicator && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 animate-fade-out">
          <div className="w-14 h-14 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center scale-110 shadow-2xl">
            {showIndicator === 'play' ? <Play size={24} className="ml-1" /> : <Pause size={24} />}
          </div>
        </div>
      )}
    </div>
  );
};
