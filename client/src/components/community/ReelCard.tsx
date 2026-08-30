import React, { useState, useRef, useEffect } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, Volume2, VolumeX, Play, UserPlus, Check, Sparkles, Trash2 } from 'lucide-react';
import { API_URL } from '../../lib/api';
import { toggleLike, toggleBookmark } from '../../services/communityService';

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
  currentUserId?: string;
  currentUserRole?: string;
  onOpenComments: (reelId: string) => void;
  onLikeToggle?: (reelId: string, currentLiked: boolean) => void;
  onDeleteReel?: (reelId: string) => void;
}

export const ReelCard: React.FC<ReelCardProps> = ({
  reel,
  isActive,
  currentUserId,
  currentUserRole,
  onOpenComments,
  onLikeToggle,
  onDeleteReel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [liked, setLiked] = useState(reel.user_has_liked || reel.is_liked || false);
  const [likesCount, setLikesCount] = useState(reel.likes_count || 0);
  const [bookmarked, setBookmarked] = useState(reel.user_has_bookmarked || reel.is_bookmarked || false);
  const [following, setFollowing] = useState(reel.is_following || false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const lastTapRef = useRef<number>(0);

  const canDelete = Boolean(
    onDeleteReel && (
      (currentUserId && (reel.author_id === currentUserId || reel.author?.id === currentUserId)) ||
      currentUserRole === 'admin' ||
      currentUserRole === 'superadmin' ||
      !currentUserId // Fallback show if handler is bound
    )
  );

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
  }, [reel]);

  // Auto-play/pause when active changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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
  }, [isActive]);

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
    const video = videoRef.current;
    if (!video) return;

    const newMuted = !isMuted;
    video.muted = newMuted;
    setIsMuted(newMuted);

    // If unmuting, ensure video is actively playing with audio enabled
    if (!newMuted) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
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
      className="relative w-full h-full max-h-[660px] max-w-[340px] xs:max-w-sm sm:max-w-md mx-auto rounded-2xl overflow-hidden snap-start shrink-0 bg-black shadow-2xl flex flex-col justify-between select-none cursor-pointer border border-white/10"
    >
      {/* Background Video */}
      {reel.media_url ? (
        <video
          ref={videoRef}
          src={reel.media_url}
          poster={reel.thumbnail_url}
          playsInline
          loop
          muted={isMuted}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (video && video.currentTime >= 90) {
              video.currentTime = 0;
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-6 text-center">
          <p className="text-white text-lg font-medium">{reel.content}</p>
        </div>
      )}

      {/* Top Gradient Overlay */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-10" />

      {/* Top Header Controls Bar */}
      <div className="relative z-30 p-3 sm:p-4 flex items-center justify-between pointer-events-none">
        {/* Mute/Unmute Speaker Button */}
        <button
          onClick={toggleMute}
          className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white pointer-events-auto hover:bg-black/80 transition-all border border-white/20 flex items-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
          title={isMuted ? "Click to Unmute Sound" : "Click to Mute Sound"}
        >
          {isMuted ? (
            <>
              <VolumeX size={15} className="text-red-400" />
              <span className="text-[11px] font-semibold text-gray-200">Tap to Unmute</span>
            </>
          ) : (
            <>
              <Volume2 size={15} className="text-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-300">Sound On</span>
            </>
          )}
        </button>

        {/* Delete Reel Button (Visible for author or admin) */}
        {canDelete && (
          <button
            onClick={handleDeleteClick}
            className="px-3 py-1.5 rounded-full bg-red-500/30 backdrop-blur-md text-red-200 hover:bg-red-600 hover:text-white pointer-events-auto transition-all border border-red-500/40 shadow-lg active:scale-95 cursor-pointer flex items-center gap-1.5"
            title="Delete Reel Video"
          >
            <Trash2 size={14} />
            <span className="text-[11px] font-semibold">Delete</span>
          </button>
        )}
      </div>

      {/* Center Play Button Overlay when video is paused */}
      {!isPlaying && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="p-4 sm:p-5 rounded-full bg-black/60 backdrop-blur-md text-white pointer-events-auto hover:scale-110 active:scale-95 transition-all border border-white/20 shadow-2xl group cursor-pointer"
            title="Click to Play Reel Video"
          >
            <Play size={32} className="fill-white text-white translate-x-0.5 group-hover:text-primary transition-colors" />
          </button>
        </div>
      )}

      {/* Double Tap Heart Animation Overlay */}
      {showHeartAnim && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
          <Heart size={90} className="text-red-500 fill-red-500 drop-shadow-lg" />
        </div>
      )}

      {/* Bottom Gradient Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-80 bg-gradient-to-t from-black/95 via-black/75 to-transparent pointer-events-none z-10" />

      {/* Bottom Content Bar & Right Action Column */}
      <div className="relative z-20 p-3 sm:p-4 pb-3.5 sm:pb-5 flex items-end justify-between gap-2 min-w-0">
        {/* Author Info & Caption Area */}
        <div className="flex-1 min-w-0 pr-1 space-y-1.5 max-h-[80%] overflow-hidden">
          {/* Author Header Row */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <img
              src={
                reel.author?.avatar_url ||
                `https://ui-avatars.com/api/?name=${reel.author?.username || 'User'}&background=6366f1&color=fff`
              }
              alt={reel.author?.username}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-white/30 shrink-0 shadow-md"
            />
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-bold text-white text-xs sm:text-sm drop-shadow-md truncate max-w-[110px] xs:max-w-[150px] sm:max-w-[190px]">
                @{reel.author?.username || 'creator'}
              </span>

              <button
                onClick={handleFollow}
                className={`px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold flex items-center gap-1 transition-all shadow-md ${
                  following
                    ? 'bg-white/20 text-white border border-white/20 backdrop-blur-md'
                    : 'bg-primary text-white hover:bg-primary/90'
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
          </div>

          {/* Reel Topic Caption */}
          {reel.content && (
            <p className="text-white text-[11px] sm:text-xs line-clamp-2 leading-snug font-sans drop-shadow-md pr-1">
              {reel.content}
            </p>
          )}

          {/* Tags & Topic Pill */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            {reel.tags && reel.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {reel.tags.slice(0, 3).map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] text-blue-300 bg-blue-500/20 backdrop-blur-md px-2 py-0.5 rounded-full font-medium border border-blue-500/30"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 text-[10px] text-gray-300 bg-white/10 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
              <Sparkles size={10} className="text-yellow-400" />
              <span>NoteStandard Topic</span>
            </div>
          </div>
        </div>

        {/* Right Floating Actions Column */}
        <div className="flex flex-col items-center gap-2 sm:gap-3 shrink-0">
          {/* Like */}
          <button
            onClick={handleLike}
            className="flex flex-col items-center gap-0.5 text-white group"
          >
            <div className="p-2 sm:p-2.5 rounded-full bg-black/40 backdrop-blur-md group-hover:scale-110 transition-transform border border-white/10">
              <Heart
                size={18}
                className={liked ? 'text-red-500 fill-red-500' : 'text-white'}
              />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-gray-200">
              {likesCount.toLocaleString()}
            </span>
          </button>

          {/* Comment */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments(reel.id);
            }}
            className="flex flex-col items-center gap-0.5 text-white group"
          >
            <div className="p-2 sm:p-2.5 rounded-full bg-black/40 backdrop-blur-md group-hover:scale-110 transition-transform border border-white/10">
              <MessageCircle size={18} />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-gray-200">
              {(reel.comments_count || 0).toLocaleString()}
            </span>
          </button>

          {/* Bookmark */}
          <button
            onClick={handleBookmark}
            className="flex flex-col items-center gap-0.5 text-white group"
          >
            <div className="p-2 sm:p-2.5 rounded-full bg-black/40 backdrop-blur-md group-hover:scale-110 transition-transform border border-white/10">
              <Bookmark
                size={18}
                className={
                  bookmarked ? 'text-yellow-400 fill-yellow-400' : 'text-white'
                }
              />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-gray-200">Save</span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex flex-col items-center gap-0.5 text-white group"
          >
            <div className="p-2 sm:p-2.5 rounded-full bg-black/40 backdrop-blur-md group-hover:scale-110 transition-transform border border-white/10">
              <Share2 size={18} />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-gray-200">Share</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default ReelCard;
