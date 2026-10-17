import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  Copy,
  Flag,
  Trash2,
  Edit3,
  EyeOff,
  UserMinus,
  ExternalLink,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import type { CommunityPost } from '../../services/communityService';
import {
  toggleLike,
  toggleBookmark,
  deletePost,
  reportItem,
  queueOfflineAction,
  votePollOption,
  sharePost,
} from '../../services/communityService';
import { CommentSection } from './CommentSection';
import { PostComposer } from './PostComposer';
import { MediaViewer } from './MediaViewer';
import { LikersModal } from './LikersModal';
import { FeedVideoPlayer } from './FeedVideoPlayer';
import { feedVideoCoordinator } from '../../utils/feedVideoCoordinator';

interface Props {
  post: CommunityPost;
  onDelete?: (id: string) => void;
  onOptimisticLike?: (id: string, isLiked: boolean) => void;
  onOptimisticBookmark?: (id: string, isBookmarked: boolean) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const UniversalPostCard: React.FC<Props> = ({
  post,
  onDelete,
  onOptimisticLike,
  onOptimisticBookmark,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const isOwner = user?.id === post.author_id;

  // ── Derived state ─────────────────────────────────────────────────────────
  const initialLiked = Boolean(
    post.user_has_liked ||
    post.is_liked ||
    (user?.id && post.community_likes?.some(l => l.user_id === user?.id))
  );
  const initialBookmarked = Boolean(
    post.user_has_bookmarked ||
    post.is_bookmarked ||
    post.bookmarked ||
    (user?.id && post.community_bookmarks?.some(b => b.user_id === user?.id))
  );

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count || post.community_likes?.length || 0);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const likeInFlight = useRef(false);
  const bookmarkInFlight = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync liked, likeCount, and bookmarked if post or user updates from parent
  useEffect(() => {
    if (!likeInFlight.current) {
      const isLiked = Boolean(
        post.user_has_liked !== undefined ? post.user_has_liked :
        post.is_liked !== undefined ? post.is_liked :
        (user?.id && post.community_likes?.some(l => l.user_id === user?.id))
      );
      setLiked(isLiked);
      setLikeCount(post.likes_count ?? (post.community_likes?.length || 0));
    }
    if (!bookmarkInFlight.current) {
      const isBookmarked = Boolean(
        post.user_has_bookmarked !== undefined ? post.user_has_bookmarked :
        post.is_bookmarked !== undefined ? post.is_bookmarked :
        post.bookmarked !== undefined ? post.bookmarked :
        (user?.id && post.community_bookmarks?.some(b => b.user_id === user?.id))
      );
      setBookmarked(isBookmarked);
    }
  }, [post.id, post.user_has_liked, post.is_liked, post.likes_count, post.user_has_bookmarked, post.is_bookmarked, user?.id]);

  // Sync commentCount if post prop updates from parent
  useEffect(() => {
    if (post.comments_count !== undefined) {
      setCommentCount(post.comments_count);
    }
  }, [post.comments_count]);

  // Lock body & feed scroll and handle Escape key when comment sheet/modal is open
  useEffect(() => {
    if (!showComments) return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const feedContainer = document.querySelector('main div.overflow-y-auto') as HTMLElement | null;
    let prevFeedOverflow = '';
    let savedScrollTop = 0;
    if (feedContainer) {
      prevFeedOverflow = feedContainer.style.overflowY;
      savedScrollTop = feedContainer.scrollTop;
      feedContainer.style.overflowY = 'hidden';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowComments(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (feedContainer) {
        feedContainer.style.overflowY = prevFeedOverflow;
        feedContainer.scrollTop = savedScrollTop;
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showComments]);

  // Click/touch outside to dismiss options menu
  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showMenu]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (likeInFlight.current) return;
    likeInFlight.current = true;

    // Optimistic
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => c + (wasLiked ? -1 : 1));
    onOptimisticLike?.(post.id, wasLiked);

    try {
      const result = navigator.onLine
        ? await toggleLike(post.id)
        : (() => { queueOfflineAction({ type: wasLiked ? 'unlike' : 'like', payload: { postId: post.id } }); return { liked: !wasLiked }; })();

      if (result && typeof result.liked === 'boolean') {
        setLiked(result.liked);
      }

      // Emit WS for cross-device sync
      if (socket && navigator.onLine) {
        socket.emit('community:like_toggled', {
          postId: post.id,
          isLiked: result.liked,
          count: likeCount + (wasLiked ? -1 : 1),
        });
      }
    } catch {
      // Rollback on failure
      setLiked(wasLiked);
      setLikeCount(c => c + (wasLiked ? 1 : -1));
      onOptimisticLike?.(post.id, !wasLiked);
    } finally {
      likeInFlight.current = false;
    }
  }, [liked, likeCount, post.id, socket, onOptimisticLike]);

  const handleBookmark = useCallback(async () => {
    if (bookmarkInFlight.current) return;
    bookmarkInFlight.current = true;

    const wasBookmarked = bookmarked;
    const nextBookmarked = !wasBookmarked;
    setBookmarked(nextBookmarked);
    onOptimisticBookmark?.(post.id, wasBookmarked);

    try {
      if (navigator.onLine) {
        const res = await toggleBookmark(post.id);
        if (res && typeof res.bookmarked === 'boolean') {
          setBookmarked(res.bookmarked);
          toast.success(res.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks', { id: `bookmark-${post.id}` });
        } else {
          toast.success(nextBookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks', { id: `bookmark-${post.id}` });
        }
      } else {
        queueOfflineAction({ type: wasBookmarked ? 'unbookmark' : 'bookmark', payload: { postId: post.id } });
        toast.success(nextBookmarked ? 'Saved offline' : 'Removed offline', { id: `bookmark-${post.id}` });
      }
    } catch {
      setBookmarked(wasBookmarked);
      onOptimisticBookmark?.(post.id, nextBookmarked);
      toast.error('Failed to update bookmark. Please try again.', { id: `bookmark-${post.id}` });
    } finally {
      bookmarkInFlight.current = false;
    }
  }, [bookmarked, post.id, onOptimisticBookmark]);

  const handleDelete = useCallback(async () => {
    setShowMenu(false);
    if (!window.confirm('Delete this post?')) return;
    try {
      await deletePost(post.id);
      onDelete?.(post.id);
      if (socket) socket.emit('community:post_deleted', { postId: post.id });
    } catch (e: unknown) {
      alert('Could not delete: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }, [post.id, socket, onDelete]);

  const handleReport = useCallback(async (reason: string) => {
    setShowMenu(false);
    await reportItem({ postId: post.id, reason });
    alert('Report submitted. Thank you.');
  }, [post.id]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/dashboard/community/post/${post.id}`;
    sharePost(post.id).catch(() => {});
    if (navigator.share) {
      await navigator.share({ title: post.title || 'Community post', url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied!');
    }
  }, [post.id, post.title]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/dashboard/community/post/${post.id}`;
    await navigator.clipboard.writeText(url);
    setShowMenu(false);
    alert('Link copied!');
  }, [post.id]);

  if (hidden) return null;

  return (
    <>
      <article
        data-testid="post-card"
        className="bg-white dark:bg-gray-900 border-y sm:border border-gray-100 sm:border-gray-200/90 dark:border-gray-800/80 rounded-none sm:rounded-2xl shadow-none sm:shadow-sm overflow-hidden transition-all duration-200"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <img
              src={post.profiles?.avatar_url || post.author?.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles?.username || post.author?.username || 'U'}&background=6366f1&color=fff`}
              alt={post.profiles?.username || post.author?.username || 'User'}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover bg-gray-100 ring-1 ring-black/5 dark:ring-white/10 cursor-pointer shrink-0"
              onClick={() => post.author_id && navigate(`/dashboard/profile/${post.author_id}`)}
            />
            <div className="min-w-0">
              <div className="flex items-center space-x-1 min-w-0">
                <h4
                  className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:underline cursor-pointer truncate"
                  onClick={() => post.author_id && navigate(`/dashboard/profile/${post.author_id}`)}
                >
                  {post.profiles?.username || post.author?.username || 'Unknown User'}
                </h4>
                {Boolean(post.profiles?.is_verified || post.author?.is_verified) && (
                  <VerifiedBadge size={14} className="ml-0.5 inline-block" />
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 truncate">
                <span>{timeAgo(post.created_at)}</span>
                {post.category && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-gray-600 dark:text-gray-300">{post.category}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Three-dot menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              id={`post-menu-${post.id}`}
              onClick={() => setShowMenu(s => !s)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 -mr-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Post options"
            >
              <MoreHorizontal size={18} />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-8 z-50 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 text-sm">
                <button onClick={handleCopyLink} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                  <Copy size={14} /> Copy link
                </button>
                {!isOwner && (
                  <>
                    <button onClick={() => { setHidden(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                      <EyeOff size={14} /> Hide post
                    </button>
                    <button onClick={() => handleReport('spam')} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                      <Flag size={14} /> Report spam
                    </button>
                    <button onClick={() => handleReport('inappropriate')} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                      <UserMinus size={14} /> Report inappropriate
                    </button>
                  </>
                )}
                {isOwner && (
                  <>
                    <hr className="my-1 border-gray-100 dark:border-gray-700" />
                    <button onClick={() => { setIsEditing(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                      <Edit3 size={14} /> Edit post
                    </button>
                    <button onClick={handleDelete} className="flex items-center gap-2 w-full px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600">
                      <Trash2 size={14} /> Delete post
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Post Title (if present) ─────────────────────────────────── */}
        {post.title && (
          <div className="px-3.5 sm:px-4 pb-2">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white leading-snug">{post.title}</h3>
          </div>
        )}

        {/* ── Media (Images/Video - Full-width, full-length edge-to-edge Instagram style) ───────── */}
        {post.media_urls && post.media_urls.length > 0 && (
          <div className="w-full overflow-hidden bg-transparent">
            {post.media_urls.length === 1 ? (
              <div
                className="relative w-full flex items-center justify-center overflow-hidden bg-transparent"
                onClick={() => {
                  const isVideoMedia = post.post_type === 'video' || post.media_urls[0].match(/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i);
                  if (!isVideoMedia) {
                    feedVideoCoordinator.pauseAll();
                    setMediaViewerIndex(0);
                    setShowMediaViewer(true);
                  }
                }}
              >
                {post.post_type === 'video' || post.media_urls[0].match(/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i) ? (
                  <FeedVideoPlayer
                    src={post.media_urls[0]}
                    postId={post.id}
                    className="w-full h-auto max-h-[85vh] object-cover block mx-auto bg-transparent"
                  />
                ) : (
                  <img
                    src={post.media_urls[0]}
                    alt="Post media"
                    className="w-full h-auto max-h-[85vh] object-cover block mx-auto hover:opacity-98 transition-opacity bg-transparent cursor-pointer"
                    loading="lazy"
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-0.5 w-full bg-gray-200 dark:bg-gray-800">
                {post.media_urls.slice(0, 4).map((url, idx) => {
                  const isVideoMedia = post.post_type === 'video' || url.match(/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i);
                  return (
                    <div
                      key={idx}
                      className="relative aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden"
                      onClick={() => {
                        if (!isVideoMedia) {
                          feedVideoCoordinator.pauseAll();
                          setMediaViewerIndex(idx);
                          setShowMediaViewer(true);
                        }
                      }}
                    >
                      {isVideoMedia ? (
                        <FeedVideoPlayer
                          src={url}
                          postId={`${post.id}-${idx}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={url}
                          alt={`Media ${idx + 1}`}
                          className="w-full h-full object-cover hover:opacity-95 transition-opacity cursor-pointer"
                          loading="lazy"
                        />
                      )}
                      {idx === 3 && post.media_urls.length > 4 && (
                        <div
                          className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center text-white font-bold text-xl cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            feedVideoCoordinator.pauseAll();
                            setMediaViewerIndex(3);
                            setShowMediaViewer(true);
                          }}
                        >
                          +{post.media_urls.length - 4}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Action Bar (Immediately under media/header) ─────────────── */}
        <div className="px-3.5 sm:px-4 pt-2.5 pb-1 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Like */}
            <div className="flex items-center">
              <button
                id={`like-${post.id}`}
                onClick={handleLike}
                aria-pressed={liked}
                aria-label={liked ? 'Unlike' : 'Like'}
                className="p-1 -ml-1 text-gray-700 dark:text-gray-200 hover:text-red-500 dark:hover:text-red-400 transition-all active:scale-90 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Heart size={22} className={liked ? 'text-red-500 fill-red-500 scale-105' : 'stroke-[1.8]'} />
              </button>
            </div>

            {/* Comments */}
            <button
              id={`comment-${post.id}`}
              onClick={() => setShowComments(s => !s)}
              aria-label="Toggle comments"
              className="p-1 text-gray-700 dark:text-gray-200 hover:text-blue-500 dark:hover:text-blue-400 transition-all active:scale-90 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <MessageCircle size={22} className="stroke-[1.8]" />
            </button>

            {/* Share */}
            <button
              id={`share-${post.id}`}
              onClick={handleShare}
              aria-label="Share"
              className="p-1 text-gray-700 dark:text-gray-200 hover:text-green-500 dark:hover:text-green-400 transition-all active:scale-90 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <Share2 size={21} className="stroke-[1.8]" />
            </button>
          </div>

          {/* Bookmark */}
          <button
            id={`bookmark-${post.id}`}
            onClick={handleBookmark}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            className="p-1 -mr-1 text-gray-700 dark:text-gray-200 hover:text-yellow-500 dark:hover:text-yellow-400 transition-all active:scale-90 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <Bookmark size={21} className={bookmarked ? 'text-yellow-500 fill-yellow-500' : 'stroke-[1.8]'} />
          </button>
        </div>

        {/* ── Likes Count ─────────────────────────────────────────────── */}
        {likeCount > 0 && (
          <div className="px-3.5 sm:px-4 py-0.5">
            <button
              id={`likers-${post.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowLikersModal(true);
              }}
              className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white hover:underline cursor-pointer"
              title="View who liked this post"
            >
              {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
            </button>
          </div>
        )}

        {/* ── Caption & Content ───────────────────────────────────────── */}
        <div className="px-3.5 sm:px-4 py-1 space-y-2">
          {post.content && (
            <p className="text-gray-800 dark:text-gray-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
              <span
                className="font-semibold text-gray-900 dark:text-white mr-1.5 cursor-pointer hover:underline"
                onClick={() => post.author_id && navigate(`/dashboard/profile/${post.author_id}`)}
              >
                {post.profiles?.username || post.author?.username || 'User'}
              </span>
              {post.content.split(/(\s+)/).map((word, i) =>
                word.startsWith('#') ? (
                  <span key={i} className="text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline" onClick={() => {}}>
                    {word}
                  </span>
                ) : word.startsWith('@') ? (
                  <span key={i} className="text-purple-600 dark:text-purple-400 font-medium cursor-pointer hover:underline">
                    {word}
                  </span>
                ) : word
              )}
            </p>
          )}

          {/* Link preview */}
          {post.post_type === 'link' && post.link_url && (
            <a
              href={post.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 sm:p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ExternalLink size={14} className="shrink-0" />
              <span className="truncate">{post.link_url}</span>
            </a>
          )}

          {/* Poll */}
          {post.post_type === 'poll' && post.poll_options && (
            <PollWidget postId={post.id} pollOptions={post.poll_options as any} />
          )}
        </div>

        {/* ── Tags ─────────────────────────────────────────────────────── */}
        {post.tags && post.tags.length > 0 && (
          <div className="px-3.5 sm:px-4 pb-1.5 flex flex-wrap gap-1.5">
            {post.tags.map((tag, i) => (
              <span key={i} className="text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Comments Preview Trigger ─────────────────────────────────── */}
        {commentCount > 0 && !showComments && (
          <div className="px-3.5 sm:px-4 pb-1">
            <button
              onClick={() => setShowComments(true)}
              className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium cursor-pointer"
            >
              View all {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </button>
          </div>
        )}

        {/* ── Timestamp footer ─────────────────────────────────────────── */}
        <div className="px-3.5 sm:px-4 pb-3 pt-0.5">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            {timeAgo(post.created_at)}
          </span>
        </div>

        {/* ── Expanded Comment Section (Preserved for layout anchors) ─────────────────── */}
      </article>

      {/* ── Modern Instagram/Facebook-Inspired Comment Sheet / Modal ────────────────── */}
      {showComments && typeof document !== 'undefined' && createPortal(
        <div
          id={`comments-sheet-${post.id}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowComments(false);
          }}
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex justify-end flex-col sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          style={{
            top: 'var(--vv-top, 0px)',
            bottom: 'auto',
            height: 'var(--vv-height, 100dvh)',
            maxHeight: 'var(--vv-height, 100dvh)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Comments"
        >
          <div
            className="bg-white dark:bg-gray-900 border-t sm:border border-gray-200 dark:border-white/10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[80vh] h-[75vh] sm:h-[650px] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{
              maxHeight: 'calc(var(--vv-height, 100dvh) - 0.5rem)',
            }}
          >
            {/* Sheet Handle for Mobile */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-sm">
                <MessageCircle size={18} className="text-blue-500" />
                <span>Comments</span>
                {commentCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    {commentCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowComments(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
                title="Close comments"
                aria-label="Close comments"
              >
                <X size={20} />
              </button>
            </div>

            {/* Post Author Context Preview (Instagram Pattern) */}
            {(post.content || post.media_urls?.[0]) && (
              <div className="px-4 py-2.5 bg-gray-50/70 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5 flex items-start gap-2.5 shrink-0">
                <img
                  src={post.profiles?.avatar_url || post.author?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.profiles?.username || post.author?.username || 'U')}&background=6366f1&color=fff`}
                  alt="Author"
                  className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 border border-gray-200/50 dark:border-white/10"
                />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
                    <span>{post.profiles?.username || post.author?.username || 'User'}</span>
                    {Boolean(post.profiles?.is_verified || post.author?.is_verified) && (
                      <VerifiedBadge size={11} className="inline-block" />
                    )}
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {post.content}
                  </p>
                </div>
              </div>
            )}

            {/* Comments Thread with Sticky Composer */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <CommentSection 
                postId={post.id} 
                onCommentAdded={() => setCommentCount(c => c + 1)}
                onCommentDeleted={() => setCommentCount(c => Math.max(0, c - 1))}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit modal */}
      {isEditing && (
        <PostComposer
          editPost={post}
          onClose={() => setIsEditing(false)}
          onPosted={() => setIsEditing(false)}
        />
      )}

      {/* Media viewer */}
      {showMediaViewer && post.media_urls && (
        <MediaViewer
          urls={post.media_urls}
          initialIndex={mediaViewerIndex}
          onClose={() => setShowMediaViewer(false)}
        />
      )}

      {/* Likers modal */}
      {showLikersModal && (
        <LikersModal
          postId={post.id}
          onClose={() => setShowLikersModal(false)}
        />
      )}
    </>
  );
};


const PollWidget: React.FC<{ postId: string; pollOptions: Array<{ id: string; option_text: string; votes_count: number }> }> = ({ postId, pollOptions }) => {
  const [voted, setVoted] = useState<string | null>(null);
  const [localOptions, setLocalOptions] = useState<Array<{ id: string; option_text: string; votes_count: number }>>(
    Array.isArray(pollOptions) ? pollOptions : []
  );

  const totalVotes = localOptions.reduce((sum, o) => sum + (o.votes_count || 0), 0);

  const handleVote = async (optionId: string) => {
    if (voted) return;
    setVoted(optionId);
    
    // Optimistic UI update
    setLocalOptions(prev => prev.map(o => o.id === optionId ? { ...o, votes_count: (o.votes_count || 0) + 1 } : o));
    
    try {
      if (!navigator.onLine) {
        queueOfflineAction({ type: 'vote', payload: { postId, optionId } });
        return;
      }
      await votePollOption(postId, optionId);
    } catch {
      // Revert on failure
      setVoted(null);
      setLocalOptions(prev => prev.map(o => o.id === optionId ? { ...o, votes_count: Math.max(0, (o.votes_count || 1) - 1) } : o));
    }
  };

  return (
    <div className="space-y-2 mt-2">
        {localOptions.map((opt) => {
          const pct = totalVotes > 0 ? Math.round(((opt.votes_count || 0) / totalVotes) * 100) : 0;
          const isVoted = voted === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={!!voted}
              className={`relative w-full text-left rounded-lg border px-4 py-2.5 text-sm overflow-hidden transition-colors ${
                isVoted ? 'border-blue-500 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              {voted && (
                <div
                  className="absolute inset-y-0 left-0 bg-blue-50 dark:bg-blue-900/20 transition-all"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative z-10">{opt.option_text}</span>
              {voted && <span className="relative z-10 float-right font-medium">{pct}%</span>}
            </button>
          );
        })}
      <p className="text-xs text-gray-400">{totalVotes} votes</p>
    </div>
  );
};
