import React, { useState, useRef, useEffect } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, Volume2, VolumeX, Play, UserPlus, Check, Sparkles, Trash2, Eye } from 'lucide-react';
import { API_URL } from '../../lib/api';
import { toggleLike, toggleBookmark } from '../../services/communityService';

/**
 * Deterministic View Count Formatter for NoteStandard Reels.
 * Formats raw view counts into clean, professional, human-readable strings.
 */
export function formatReelViews(count?: number | null): { formatted: string; full: string } {
  const num = Math.max(0, Math.floor(Number(count) || 0));
  const full = `${num.toLocaleString()} ${num === 1 ? 'view' : 'views'}`;

  if (num < 1000) {
    return { formatted: `${num} ${num === 1 ? 'view' : 'views'}`, full };
  }

  let valString = '';
  if (num >= 1000000) {
    const val = num / 1000000;
    valString = (val % 1 === 0 || val >= 100 ? val.toFixed(0) : val.toFixed(1).replace(/\.0$/, '')) + 'M';
  } else {
    const val = num / 1000;
    valString = (val % 1 === 0 || val >= 100 ? val.toFixed(0) : val.toFixed(1).replace(/\.0$/, '')) + 'K';
  }

  return { formatted: `${valString} views`, full };
}

export type ReelPost = {
  id: string;
  author_id: string;
  author?: {
    id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
  };
  content: string;
  media_url?: string;
  thumbnail_url?: string;
  video_duration?: number;
  video_aspect_ratio?: string;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  views_count?: number;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  user_has_liked?: boolean;
  user_has_bookmarked?: boolean;
  is_following?: boolean;
  tags?: string[];
  created_at: string;
}

interface ReelCardProps {
  reel: ReelPost;
  isActive: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  isInResourceWindow?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onOpenComments: (reelId: string) => void;
  onLikeToggle?: (reelId: string, currentLiked: boolean) => void;
  onDeleteReel?: (reelId: string) => void;
  onRecordView?: (reelId: string, metadata?: { watch_duration_seconds?: number; is_muted?: boolean; completed?: boolean }) => void;
}

export const ReelCard: React.FC<ReelCardProps> = ({
  reel,
  isActive,
  isMuted = true,
  onToggleMute,
  isInResourceWindow = true,
  currentUserId,
  currentUserRole,
  onOpenComments,
  onLikeToggle,
  onDeleteReel,
  onRecordView,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(reel.user_has_liked || reel.is_liked || false);
  const [likesCount, setLikesCount] = useState(reel.likes_count || 0);
  const [bookmarked, setBookmarked] = useState(reel.user_has_bookmarked || reel.is_bookmarked || false);
  const [viewsCount, setViewsCount] = useState(reel.views_count || 0);
  const [following, setFollowing] = useState(reel.is_following || false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const lastTapRef = useRef<number>(0);
  const hasViewTrackedRef = useRef<boolean>(false);
  const activePlaybackTimeRef = useRef<number>(0);

  const isOwner = Boolean(
    currentUserId && (reel.author_id === currentUserId || reel.author?.id === currentUserId)
  );
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'superadmin';
  const canDelete = Boolean(onDeleteReel && (isOwner || isAdmin));

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this Reel video permanently?')) {
      if (onDeleteReel) {
        onDeleteReel(reel.id);
      }
    }
  };

  // Sync state if reel prop updates
  useEffect(() => {
    setLiked(reel.user_has_liked || reel.is_liked || false);
    setLikesCount(reel.likes_count || 0);
    setBookmarked(reel.user_has_bookmarked || reel.is_bookmarked || false);
    setViewsCount(reel.views_count || 0);
  }, [reel]);

  const { formatted: formattedViews, full: fullViewsText } = formatReelViews(viewsCount);

  // Keep video element muted property synchronized with shared isMuted prop
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = isMuted;
    }
  }, [isMuted]);

  // 2-second actual active playback view tracking trigger
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkAndIncrement = () => {
      if (isActive && isPlaying && !document.hidden && !hasViewTrackedRef.current) {
        activePlaybackTimeRef.current += 0.2;
        if (activePlaybackTimeRef.current >= 2.0) {
          hasViewTrackedRef.current = true;
          if (onRecordView) {
            onRecordView(reel.id, {
              watch_duration_seconds: activePlaybackTimeRef.current,
              is_muted: isMuted,
              completed: false,
            });
          }
          if (interval) clearInterval(interval);
        }
      }
    };

    if (isActive && isPlaying && !hasViewTrackedRef.current) {
      interval = setInterval(checkAndIncrement, 200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, isPlaying, isMuted, reel.id, onRecordView]);


  // Auto-play/pause when active changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isInResourceWindow) return;

    if (isActive) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive, isInResourceWindow]);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleMute) {
      onToggleMute();
    }
  };

  const handleDoubleTap = async (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setShowHeartAnim(true);
      setTimeout(() => setShowHeartAnim(false), 900);
      if (!liked) {
        setLiked(true);
        setLikesCount(prev => prev + 1);
        try {
          await toggleLike(reel.id);
          if (onLikeToggle) onLikeToggle(reel.id, false);
        } catch {
          setLiked(false);
          setLikesCount(prev => Math.max(0, prev - 1));
        }
      }
    } else {
      togglePlay();
    }
    lastTapRef.current = now;
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const wasLiked = liked;
    const newLiked = !wasLiked;
    setLiked(newLiked);
    setLikesCount(prev => (newLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      await toggleLike(reel.id);
      if (onLikeToggle) onLikeToggle(reel.id, wasLiked);
    } catch {
      // Rollback on failure
      setLiked(wasLiked);
      setLikesCount(prev => (wasLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const wasBookmarked = bookmarked;
    const newBookmarked = !wasBookmarked;
    setBookmarked(newBookmarked);

    try {
      await toggleBookmark(reel.id);
    } catch {
      setBookmarked(wasBookmarked);
    }
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newFollowing = !following;
    setFollowing(newFollowing);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/community/profile/${reel.author_id}/follow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setFollowing(!newFollowing);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/community/post/${reel.id}/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    } catch {}

    if (navigator.share) {
      navigator.share({
        title: `Reel by @${reel.author?.username || 'NoteStandard'}`,
        text: reel.content,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Reel link copied to clipboard!');
    }
  };

  return (
    <div
      onClick={handleDoubleTap}
      className="relative w-full h-full sm:max-h-[calc(100vh-5rem)] sm:max-w-[420px] mx-auto rounded-none sm:rounded-2xl overflow-hidden snap-start shrink-0 bg-black shadow-2xl flex flex-col justify-between select-none cursor-pointer border-0 sm:border sm:border-white/10"
    >
      {/* Background Video (Only mounted within safe active-1..active+1 resource window) */}
      {reel.media_url && isInResourceWindow ? (
        <video
          ref={videoRef}
          src={reel.media_url}
          poster={reel.thumbnail_url}
          playsInline
          loop
          muted={isMuted}
          preload={isInResourceWindow ? "auto" : "metadata"}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (video && video.currentTime >= 90) {
              video.currentTime = 0;
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : reel.thumbnail_url ? (
        <img
          src={reel.thumbnail_url}
          alt={reel.content || 'Reel preview'}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-black flex items-center justify-center p-6 text-center">
          <p className="text-white text-lg font-medium drop-shadow">{reel.content}</p>
        </div>
      )}

      {/* Top Gradient Overlay for Header Contrast */}
      <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-black/85 via-black/35 to-transparent pointer-events-none z-10" />

      {/* Top Floating Controls Bar (Mute Sound Pill on Left, Delete Icon on Right - Positioned at top-14/top-16 to prevent collision with top branding overlay) */}
      <div className="absolute top-14 sm:top-16 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        {/* Floating Sound Toggle Pill */}
        <button
          onClick={toggleMute}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md text-white pointer-events-auto hover:bg-black/80 transition-all border border-white/20 shadow-xl active:scale-95 cursor-pointer text-xs font-semibold group"
          title={isMuted ? "Unmute Sound" : "Mute Sound"}
        >
          {isMuted ? (
            <>
              <VolumeX size={14} className="text-red-400 group-hover:scale-110 transition-transform" />
              <span className="text-[11px]">Muted</span>
            </>
          ) : (
            <>
              <Volume2 size={14} className="text-emerald-400 animate-pulse group-hover:scale-110 transition-transform" />
              <span className="text-[11px] text-emerald-300">Sound On</span>
            </>
          )}
        </button>

        {/* Delete Reel Icon Button (Visible for author or admin) */}
        {canDelete && (
          <button
            onClick={handleDeleteClick}
            className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md text-red-400 hover:text-white hover:bg-red-600/80 hover:border-red-500/60 pointer-events-auto transition-all border border-white/20 shadow-xl active:scale-95 cursor-pointer flex items-center justify-center group"
            title="Delete Reel Video"
          >
            <Trash2 size={15} className="group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      {/* Center Play Button Overlay when video is paused */}
      {!isPlaying && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="p-4 sm:p-5 rounded-full bg-black/60 backdrop-blur-md text-white pointer-events-auto hover:scale-110 active:scale-95 transition-all border border-white/25 shadow-2xl group cursor-pointer"
            title="Click to Play Reel Video"
          >
            <Play size={32} className="fill-white text-white translate-x-0.5 group-hover:text-primary transition-colors" />
          </button>
        </div>
      )}

      {/* Double Tap Heart Animation Overlay */}
      {showHeartAnim && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
          <Heart size={96} className="text-red-500 fill-red-500 drop-shadow-2xl" />
        </div>
      )}

      {/* Bottom Gradient Overlay for Metadata Contrast */}
      <div className="absolute bottom-0 left-0 right-0 h-80 bg-gradient-to-t from-black/95 via-black/65 to-transparent pointer-events-none z-10" />

      {/* Bottom Left Creator Metadata & Caption Area */}
      <div className="absolute bottom-6 sm:bottom-8 left-3 sm:left-4 right-16 sm:right-20 z-30 flex flex-col gap-2 pointer-events-auto max-h-[60%] overflow-hidden pr-1 pb-safe">
        {/* Author Header Row */}
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={
              reel.author?.avatar_url ||
              `https://ui-avatars.com/api/?name=${reel.author?.username || 'User'}&background=6366f1&color=fff`
            }
            alt={reel.author?.username}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-white/40 shrink-0 shadow-lg"
          />
          <span className="font-bold text-white text-xs sm:text-sm drop-shadow-md truncate shrink min-w-0 max-w-[130px] sm:max-w-[180px]">
            @{reel.author?.username || 'creator'}
          </span>

          <button
            onClick={handleFollow}
            className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all shadow-md active:scale-95 cursor-pointer ${
              following
                ? 'bg-white/20 text-white border border-white/25 backdrop-blur-md'
                : 'bg-primary hover:bg-primary/90 text-white shadow-primary/30'
            }`}
          >
            {following ? (
              <>
                <Check size={11} /> Following
              </>
            ) : (
              <>
                <UserPlus size={11} /> Follow
              </>
            )}
          </button>
        </div>

        {/* Reel Topic Caption */}
        {reel.content && (
          <p className="text-white text-xs sm:text-sm line-clamp-3 leading-snug font-sans drop-shadow-md select-text">
            {reel.content}
          </p>
        )}

        {/* Tags & Topic Pill */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {/* Public View Count Indicator Pill */}
          <div
            className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-white bg-black/55 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/20 shadow-md cursor-default select-none"
            title={fullViewsText}
            aria-label={fullViewsText}
          >
            <Eye size={12} className="text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="drop-shadow-sm font-mono sm:font-sans">{formattedViews}</span>
          </div>

          {reel.tags && reel.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {reel.tags.slice(0, 3).map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[10px] text-blue-200 bg-blue-500/25 backdrop-blur-md px-2.5 py-0.5 rounded-full font-medium border border-blue-400/30 shadow-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-gray-200 bg-white/15 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/15 shadow-sm">
            <Sparkles size={10} className="text-yellow-400" />
            <span>NoteStandard Topic</span>
          </div>
        </div>
      </div>

      {/* Right Side Vertical Action Rail */}
      <div className="absolute bottom-6 sm:bottom-8 right-2.5 sm:right-4 z-30 flex flex-col items-center gap-3 sm:gap-4 pointer-events-auto pb-safe">
        {/* Like */}
        <button
          onClick={handleLike}
          className="flex flex-col items-center gap-1 text-white group cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/45 backdrop-blur-md group-hover:scale-110 active:scale-95 transition-all border border-white/15 shadow-xl flex items-center justify-center">
            <Heart
              size={20}
              className={liked ? 'text-red-500 fill-red-500' : 'text-white'}
            />
          </div>
          <span className="text-[11px] font-semibold text-gray-100 drop-shadow-md">
            {likesCount.toLocaleString()}
          </span>
        </button>

        {/* Comment */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments(reel.id);
          }}
          className="flex flex-col items-center gap-1 text-white group cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/45 backdrop-blur-md group-hover:scale-110 active:scale-95 transition-all border border-white/15 shadow-xl flex items-center justify-center">
            <MessageCircle size={20} />
          </div>
          <span className="text-[11px] font-semibold text-gray-100 drop-shadow-md">
            {(reel.comments_count || 0).toLocaleString()}
          </span>
        </button>

        {/* Bookmark */}
        <button
          onClick={handleBookmark}
          className="flex flex-col items-center gap-1 text-white group cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/45 backdrop-blur-md group-hover:scale-110 active:scale-95 transition-all border border-white/15 shadow-xl flex items-center justify-center">
            <Bookmark
              size={20}
              className={
                bookmarked ? 'text-yellow-400 fill-yellow-400' : 'text-white'
              }
            />
          </div>
          <span className="text-[11px] font-semibold text-gray-100 drop-shadow-md">Save</span>
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          className="flex flex-col items-center gap-1 text-white group cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/45 backdrop-blur-md group-hover:scale-110 active:scale-95 transition-all border border-white/15 shadow-xl flex items-center justify-center">
            <Share2 size={20} />
          </div>
          <span className="text-[11px] font-semibold text-gray-100 drop-shadow-md">Share</span>
        </button>
      </div>
    </div>
  );
};
export default ReelCard;
