import React, { useState, useCallback, useRef } from 'react';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  CheckCircle,
  Copy,
  Flag,
  Trash2,
  Edit3,
  EyeOff,
  UserMinus,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
  CommunityPost,
  toggleLike,
  toggleBookmark,
  deletePost,
  reportItem,
  queueOfflineAction,
  votePollOption,
} from '../../services/communityService';
import { CommentSection } from './CommentSection';
import { PostComposer } from './PostComposer';
import { MediaViewer } from './MediaViewer';

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
  const { user } = useAuth();
  const { socket } = useSocket();
  const isOwner = user?.id === post.author_id;

  // ── Derived state ─────────────────────────────────────────────────────────
  const initialLiked = Boolean(post.community_likes?.some(l => l.user_id === user?.id));
  const initialBookmarked = Boolean(post.community_bookmarks?.some(b => b.user_id === user?.id));

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count || post.community_likes?.length || 0);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const likeInFlight = useRef(false);
  const bookmarkInFlight = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    } finally {
      likeInFlight.current = false;
    }
  }, [liked, likeCount, post.id, socket, onOptimisticLike]);

  const handleBookmark = useCallback(async () => {
    if (bookmarkInFlight.current) return;
    bookmarkInFlight.current = true;

    const wasBookmarked = bookmarked;
    setBookmarked(!wasBookmarked);
    onOptimisticBookmark?.(post.id, wasBookmarked);

    try {
      if (navigator.onLine) {
        await toggleBookmark(post.id);
      } else {
        queueOfflineAction({ type: wasBookmarked ? 'unbookmark' : 'bookmark', payload: { postId: post.id } });
      }
    } catch {
      setBookmarked(wasBookmarked);
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
    if (navigator.share) {
      await navigator.share({ title: post.title || 'Community post', url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied!');
    }
  }, [post]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/dashboard/community/post/${post.id}`;
    await navigator.clipboard.writeText(url);
    setShowMenu(false);
    alert('Link copied!');
  }, [post.id]);

  if (hidden) return null;

  return (
    <>
      <article className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-shadow hover:shadow-md">
        <div className="p-4 sm:p-5">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <img
                src={post.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles?.username || 'U'}&background=6366f1&color=fff`}
                alt={post.profiles?.username || 'User'}
                className="w-10 h-10 rounded-full object-cover bg-gray-100 cursor-pointer"
                onClick={() => window.location.hash = `#profile/${post.author_id}`}
              />
              <div>
                <div className="flex items-center space-x-1">
                  <h4
                    className="font-bold text-sm text-gray-900 dark:text-white hover:underline cursor-pointer"
                    onClick={() => window.location.hash = `#profile/${post.author_id}`}
                  >
                    {post.profiles?.username || 'Unknown User'}
                  </h4>
                  {post.profiles?.is_verified && (
                    <CheckCircle size={13} className="text-blue-500 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {timeAgo(post.created_at)} · {post.category}
                </p>
              </div>
            </div>

            {/* Three-dot menu */}
            <div className="relative" ref={menuRef}>
              <button
                id={`post-menu-${post.id}`}
                onClick={() => setShowMenu(s => !s)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full"
                aria-label="Post options"
              >
                <MoreHorizontal size={20} />
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

          {/* ── Content ──────────────────────────────────────────────────── */}
          <div className="mb-4 space-y-3">
            {post.title && <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{post.title}</h2>}
            {post.content && (
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">
                {post.content.split(/(\s+)/).map((word, i) =>
                  word.startsWith('#') ? (
                    <span key={i} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => {}}>
                      {word}
                    </span>
                  ) : word.startsWith('@') ? (
                    <span key={i} className="text-purple-600 dark:text-purple-400 cursor-pointer hover:underline">
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
                className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ExternalLink size={14} className="shrink-0" />
                <span className="truncate">{post.link_url}</span>
              </a>
            )}

            {/* Images */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className={`grid gap-1 rounded-xl overflow-hidden ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {post.media_urls.slice(0, 4).map((url, idx) => (
                  <div
                    key={idx}
                    className="relative cursor-pointer bg-gray-100 dark:bg-gray-800"
                    onClick={() => { setMediaViewerIndex(idx); setShowMediaViewer(true); }}
                  >
                    {url.match(/\.(mp4|webm|ogg)$/i) ? (
                      <video src={url} className="w-full h-48 object-cover" />
                    ) : (
                      <img
                        src={url}
                        alt={`Media ${idx + 1}`}
                        className="w-full h-48 object-cover hover:opacity-95 transition-opacity"
                        loading="lazy"
                      />
                    )}
                    {idx === 3 && post.media_urls.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-xl">
                        +{post.media_urls.length - 4}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Poll */}
            {post.post_type === 'poll' && post.poll_options && (
              <PollWidget postId={post.id} pollOptions={post.poll_options} />
            )}
          </div>

          {/* ── Tags ─────────────────────────────────────────────────────── */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag, i) => (
                <span key={i} className="text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* ── Action Bar ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800/60">
            <div className="flex items-center space-x-5">
              {/* Like */}
              <button
                id={`like-${post.id}`}
                onClick={handleLike}
                aria-pressed={liked}
                aria-label={liked ? 'Unlike' : 'Like'}
                className={`flex items-center space-x-1.5 text-sm font-medium transition-colors group ${liked ? 'text-red-500' : 'text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400'}`}
              >
                <div className={`p-1.5 rounded-full transition-colors ${liked ? 'bg-red-50 dark:bg-red-500/10' : 'group-hover:bg-red-50 dark:group-hover:bg-red-500/10'}`}>
                  <Heart size={17} className={liked ? 'fill-current' : ''} />
                </div>
                <span>{likeCount}</span>
              </button>

              {/* Comments */}
              <button
                id={`comment-${post.id}`}
                onClick={() => setShowComments(s => !s)}
                aria-label="Toggle comments"
                className="flex items-center space-x-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors group"
              >
                <div className="p-1.5 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 transition-colors">
                  <MessageCircle size={17} />
                </div>
                <span>{post.comments_count ?? 0}</span>
              </button>

              {/* Share */}
              <button
                id={`share-${post.id}`}
                onClick={handleShare}
                aria-label="Share"
                className="flex items-center space-x-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors group"
              >
                <div className="p-1.5 rounded-full group-hover:bg-green-50 dark:group-hover:bg-green-500/10 transition-colors">
                  <Share2 size={17} />
                </div>
                <span>{post.shares_count || 0}</span>
              </button>
            </div>

            {/* Bookmark */}
            <button
              id={`bookmark-${post.id}`}
              onClick={handleBookmark}
              aria-pressed={bookmarked}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
              className={`p-1.5 rounded-full transition-colors ${bookmarked ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-500/10' : 'text-gray-500 dark:text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10'}`}
            >
              <Bookmark size={17} className={bookmarked ? 'fill-current' : ''} />
            </button>
          </div>
        </div>

        {/* ── Comments ───────────────────────────────────────────────────── */}
        {showComments && (
          <div className="border-t border-gray-100 dark:border-gray-800">
            <CommentSection postId={post.id} />
          </div>
        )}
      </article>

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
