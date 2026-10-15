import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, X, Edit3, Trash2, Reply, Heart, MessageCircle } from 'lucide-react';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import type { CommunityComment } from '../../services/communityService';
import { useKeyboardLayout } from '../../hooks/useKeyboardLayout';
import {
  getComments,
  addComment,
  editComment,
  deleteComment,
  toggleCommentLike,
} from '../../services/communityService';

interface Props {
  postId: string;
  onCommentAdded?: () => void;
  onCommentDeleted?: () => void;
  onClose?: () => void;
  showHeader?: boolean;
  headerTitle?: string;
  postAuthor?: {
    username?: string;
    avatar_url?: string;
    is_verified?: boolean;
  };
  postCaption?: string;
  className?: string;
}

interface CommentItemProps {
  comment: CommunityComment;
  postId: string;
  level?: number;
  onReply: (parentId: string, username: string) => void;
  onDeleted: (id: string) => void;
  onEdited: (updated: CommunityComment) => void;
  onToggleLike: (commentId: string) => void | Promise<void>;
}

function formatCommentTime(iso: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, postId, level = 0, onReply, onDeleted, onEdited, onToggleLike }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const isOwner = user?.id === comment.author_id;

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    const updated = await editComment(comment.id, editText.trim());
    onEdited(updated);
    setEditMode(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this comment?')) return;
    await deleteComment(comment.id);
    onDeleted(comment.id);
  };

  const avatarSize = level > 0 ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-8 h-8';

  return (
    <div className={`group/comment transition-colors ${level > 0 ? 'ml-6 sm:ml-9 border-l-2 border-gray-200/80 dark:border-gray-800 pl-3 sm:pl-3.5 space-y-2 mt-2' : 'py-2.5'}`}>
      <div className="flex items-start gap-2.5">
        <img
          src={comment.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.profiles?.username || 'U')}&background=6366f1&color=fff`}
          alt={comment.profiles?.username || 'User'}
          className={`${avatarSize} rounded-full object-cover shrink-0 cursor-pointer hover:opacity-85 transition-opacity mt-0.5 border border-gray-200/60 dark:border-white/10`}
          onClick={() => comment.author_id && navigate(`/dashboard/profile/${comment.author_id}`)}
        />
        <div className="flex-1 min-w-0">
          {/* Bubble (Facebook/Instagram Hybrid) */}
          <div className="inline-block max-w-full bg-gray-100/90 dark:bg-white/[0.06] rounded-2xl px-3.5 py-2 text-left border border-transparent dark:border-white/[0.03]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                onClick={() => comment.author_id && navigate(`/dashboard/profile/${comment.author_id}`)}
                className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white cursor-pointer hover:underline inline-flex items-center gap-1"
              >
                {comment.profiles?.username || 'User'}
              </span>
              {Boolean(comment.profiles?.is_verified) && (
                <VerifiedBadge size={12} className="inline-block" />
              )}
              {comment.is_edited && (
                <span className="text-[10px] text-gray-400 font-normal">· edited</span>
              )}
            </div>

            {editMode ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-gray-300 dark:border-gray-700 rounded-xl p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setEditMode(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1 font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 mt-0.5 leading-relaxed break-words whitespace-pre-wrap">
                {comment.content}
              </p>
            )}
          </div>

          {/* Action Row below bubble */}
          <div className="flex items-center gap-3 mt-1 ml-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
            <span className="text-[11px] font-normal text-gray-400">
              {formatCommentTime(comment.created_at)}
            </span>

            <button
              type="button"
              onClick={() => onToggleLike(comment.id)}
              aria-label={comment.is_liked ? "Unlike comment" : "Like comment"}
              className={`flex items-center gap-1 transition-colors p-1 -m-1 rounded-md active:scale-90 cursor-pointer ${
                comment.is_liked 
                  ? 'text-red-500 hover:text-red-600 font-semibold' 
                  : 'text-gray-400 hover:text-red-500'
              }`}
              title={comment.is_liked ? "Unlike" : "Like"}
            >
              <Heart 
                size={13} 
                className={`${comment.is_liked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} 
              />
              <span>{comment.likes_count || 0}</span>
            </button>

            <button
              onClick={() => onReply(comment.id, comment.profiles?.username || 'User')}
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              Reply
            </button>

            {isOwner && !editMode && (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.map(reply => (
        <CommentItem
          key={reply.id}
          comment={reply}
          postId={postId}
          level={(level || 0) + 1}
          onReply={onReply}
          onDeleted={onDeleted}
          onEdited={onEdited}
          onToggleLike={onToggleLike}
        />
      ))}
    </div>
  );
};

export const CommentSection: React.FC<Props> = ({
  postId,
  onCommentAdded,
  onCommentDeleted,
  onClose,
  showHeader = false,
  headerTitle,
  postAuthor,
  postCaption,
  className = '',
}) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { isKeyboardOpen, kbHeight } = useKeyboardLayout();
  const [rawComments, setRawComments] = useState<CommunityComment[]>([]);
  const tree = useMemo(() => buildTree(rawComments), [rawComments]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRafRef = useRef<number | null>(null);

  const userAvatar = useMemo(() => {
    return (
      user?.avatar_url ||
      (user as any)?.user_metadata?.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.user_metadata?.username || user?.email?.split('@')[0] || 'U')}&background=6366f1&color=fff`
    );
  }, [user]);

  // ── Unmount cleanup for focus animations ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (focusRafRef.current !== null) cancelAnimationFrame(focusRafRef.current);
      if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
    };
  }, []);

  // ── Load comments ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getComments(postId);
        if (!cancelled) setRawComments(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  // ── Real-time comments ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    socket.emit('community:join_post', postId);

    const handleAdded = ({ comment }: { comment: CommunityComment }) => {
      setRawComments(prev => {
        if (prev.some(c => c.id === comment.id)) return prev;
        onCommentAdded?.();
        return [...prev, comment];
      });
    };

    const handleSocketCommentDeleted = ({ commentId }: { commentId: string }) => {
      setRawComments(prev => {
        if (prev.some(c => c.id === commentId)) {
          onCommentDeleted?.();
          return prev.filter(c => c.id !== commentId && c.parent_id !== commentId);
        }
        return prev;
      });
    };

    socket.on('community:comment_added', handleAdded);
    socket.on('community:comment_deleted', handleSocketCommentDeleted);

    return () => {
      socket.emit('community:leave_post', postId);
      socket.off('community:comment_added', handleAdded);
      socket.off('community:comment_deleted', handleSocketCommentDeleted);
    };
  }, [socket, postId, onCommentAdded, onCommentDeleted]);

  // ── Scroll-into-view within nested scroll container ──────────────────────
  const scrollToComposer = useCallback(() => {
    if (!composerRef.current) return;
    if (inputRef.current && document.activeElement !== inputRef.current) return;
    const container = findScrollContainer(composerRef.current);
    if (!container) {
      try {
        composerRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch {}
      return;
    }

    const composerRect = composerRef.current.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const vp = window.visualViewport;
    const vpBottom = vp ? (vp.offsetTop + vp.height) : (window.innerHeight - kbHeight);

    let bottomCutoff = Math.min(containerRect.bottom, vpBottom);

    // Account for fixed navigation overlay if present
    const nav = document.querySelector('nav');
    if (nav) {
      const navRect = nav.getBoundingClientRect();
      if (navRect.top > 0 && navRect.top < bottomCutoff) {
        bottomCutoff = navRect.top;
      }
    }

    const safeMargin = 16;
    const targetBottom = bottomCutoff - safeMargin;

    if (composerRect.bottom > targetBottom) {
      const delta = composerRect.bottom - targetBottom;
      container.scrollBy({
        top: delta,
        behavior: 'smooth',
      });
    } else if (composerRect.top < containerRect.top + 60) {
      const delta = composerRect.top - (containerRect.top + 70);
      container.scrollBy({
        top: delta,
        behavior: 'smooth',
      });
    }
  }, [kbHeight]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (focusRafRef.current !== null) cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      scrollToComposer();
      focusRafRef.current = null;
    });
    if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      scrollToComposer();
      focusTimerRef.current = null;
    }, 300);
  }, [scrollToComposer]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (focusRafRef.current !== null) {
      cancelAnimationFrame(focusRafRef.current);
      focusRafRef.current = null;
    }
    if (focusTimerRef.current !== null) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
  }, []);

  // Listen to visualViewport resize/scroll when focused
  useEffect(() => {
    if (!isFocused || typeof window === 'undefined') return;
    const vp = window.visualViewport;
    if (!vp) return;

    let rafId: number | null = null;
    const handleVpChange = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        scrollToComposer();
        rafId = null;
      });
    };

    vp.addEventListener('resize', handleVpChange, { passive: true });
    vp.addEventListener('scroll', handleVpChange, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      vp.removeEventListener('resize', handleVpChange);
      vp.removeEventListener('scroll', handleVpChange);
    };
  }, [isFocused, scrollToComposer]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting || !user) return;
    setSubmitting(true);
    try {
      const comment = await addComment({
        postId,
        content: trimmed,
        parentId: replyTo?.id,
      });
      setRawComments(prev => {
        if (prev.some(c => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
      setText('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      setReplyTo(null);
      if (socket) {
        socket.emit('community:comment_added', { postId, comment });
      }
      onCommentAdded?.();
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, user, postId, replyTo, socket, onCommentAdded]);

  const handleReply = useCallback((parentId: string, username: string) => {
    setReplyTo({ id: parentId, username });
    setText(`@${username} `);
    inputRef.current?.focus();
  }, []);

  const handleEdited = useCallback((updated: CommunityComment) => {
    setRawComments(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setRawComments(prev => {
      if (prev.some(c => c.id === id)) {
        onCommentDeleted?.();
        return prev.filter(c => c.id !== id && c.parent_id !== id);
      }
      return prev;
    });
  }, [onCommentDeleted]);

  const isInputActiveOnMobile = isFocused && (isKeyboardOpen || (typeof window !== 'undefined' && window.visualViewport && window.visualViewport.height < window.innerHeight - 50));
  const bufferHeight = isInputActiveOnMobile ? Math.max(kbHeight, 300) : 0;
  const pendingLikesRef = useRef<Set<string>>(new Set());

  const handleToggleLike = useCallback(async (commentId: string) => {
    if (!user?.id || pendingLikesRef.current.has(commentId)) return;

    const target = rawComments.find(c => c.id === commentId);
    if (!target) return;

    pendingLikesRef.current.add(commentId);
    const prevLiked = Boolean(target.is_liked);
    const prevCount = target.likes_count || 0;
    const nextLiked = !prevLiked;
    const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

    // Optimistic update
    setRawComments(prev =>
      prev.map(c =>
        c.id === commentId
          ? { ...c, is_liked: nextLiked, likes_count: nextCount }
          : c
      )
    );

    try {
      const res = await toggleCommentLike(commentId);
      if (res && typeof res.liked === 'boolean') {
        setRawComments(prev =>
          prev.map(c =>
            c.id === commentId
              ? { ...c, is_liked: res.liked, likes_count: res.likes_count ?? nextCount }
              : c
          )
        );
      }
    } catch {
      // Rollback on failure
      setRawComments(prev =>
        prev.map(c =>
          c.id === commentId
            ? { ...c, is_liked: prevLiked, likes_count: prevCount }
            : c
        )
      );
    } finally {
      pendingLikesRef.current.delete(commentId);
    }
  }, [user?.id, rawComments]);

  return (
    <div className={`flex flex-col h-full min-h-0 bg-transparent ${className}`}>
      {/* Optional Header (Instagram/Facebook pattern) */}
      {showHeader && (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-sm">
            <MessageCircle size={18} className="text-blue-500" />
            <span>{headerTitle || 'Comments'}</span>
            {rawComments.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {rawComments.length}
              </span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
              title="Close comments"
              aria-label="Close comments"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* Post Author Context Preview (Instagram Pattern) */}
      {postCaption && (
        <div className="px-4 py-2.5 bg-gray-50/70 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5 flex items-start gap-2.5 shrink-0">
          <img
            src={postAuthor?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(postAuthor?.username || 'U')}&background=6366f1&color=fff`}
            alt={postAuthor?.username || 'Author'}
            className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 border border-gray-200/50 dark:border-white/10"
          />
          <div className="flex-1 min-w-0 text-xs">
            <div className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
              <span>{postAuthor?.username || 'Author'}</span>
              {Boolean(postAuthor?.is_verified) && (
                <VerifiedBadge size={11} className="inline-block" />
              )}
            </div>
            <p className="text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
              {postCaption}
            </p>
          </div>
        </div>
      )}

      {/* Scrollable Comments Thread */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3 space-y-3 pb-20 md:pb-5">
        {loading ? (
          <div className="py-6 space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-10 bg-gray-100 dark:bg-gray-800/70 rounded-2xl w-3/4" />
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-800/40 rounded w-1/4 ml-2" />
                </div>
              </div>
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center mb-3">
              <MessageCircle size={22} />
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">No comments yet</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
              Be the first to share your thoughts on this post!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50/50 dark:divide-gray-800/30">
            {tree.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                postId={postId}
                level={0}
                onReply={handleReply}
                onDeleted={handleDeleted}
                onEdited={handleEdited}
                onToggleLike={handleToggleLike}
              />
            ))}
          </div>
        )}

        {/* Keyboard avoidance buffer spacer for nested scroll container */}
        <div
          style={{
            height: bufferHeight,
            transition: 'height 0.2s ease-out',
          }}
          aria-hidden="true"
        />
      </div>

      {/* Anchored Bottom Composer */}
      {user && (
        <div
          ref={composerRef}
          className="shrink-0 border-t border-gray-100 dark:border-white/10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md px-3.5 py-2.5 pb-[env(safe-area-inset-bottom,8px)]"
        >
          {replyTo && (
            <div className="flex items-center justify-between px-3 py-1.5 mb-2 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 rounded-xl text-xs text-blue-600 dark:text-blue-400">
              <span className="flex items-center gap-1.5 font-medium truncate">
                <Reply size={12} className="rotate-180 shrink-0" />
                Replying to <span className="font-semibold">@{replyTo.username}</span>
              </span>
              <button
                onClick={() => { setReplyTo(null); setText(''); }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full cursor-pointer ml-2"
                aria-label="Cancel reply"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2.5">
            <img
              src={userAvatar}
              alt={user?.email || 'You'}
              className="w-8 h-8 rounded-full object-cover shrink-0 mb-0.5 border border-gray-200 dark:border-gray-700"
            />
            <div className="flex-1 flex items-end bg-gray-100 dark:bg-white/[0.06] rounded-2xl border border-transparent focus-within:border-blue-500/50 focus-within:bg-white dark:focus-within:bg-gray-800/90 focus-within:ring-2 focus-within:ring-blue-500/20 pr-1 transition-all">
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                rows={1}
                placeholder={replyTo ? `Reply to @${replyTo.username}...` : "Write a comment..."}
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white px-3.5 py-2 focus:outline-none resize-none max-h-28 overflow-y-auto leading-relaxed placeholder:text-gray-400"
                maxLength={2000}
              />
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
                className="p-2 mb-0.5 rounded-full text-blue-600 dark:text-blue-400 disabled:opacity-30 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Send comment"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildTree(comments: CommunityComment[]): CommunityComment[] {
  const map = new Map<string, CommunityComment>();
  const roots: CommunityComment[] = [];

  for (const c of comments) {
    map.set(c.id, { ...c, replies: [] });
  }
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies!.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

function flattenTree(comments: CommunityComment[]): CommunityComment[] {
  const result: CommunityComment[] = [];
  const walk = (list: CommunityComment[]) => {
    for (const c of list) {
      result.push(c);
      if (c.replies) walk(c.replies);
    }
  };
  walk(comments);
  return result;
}

function getLevel(roots: CommunityComment[], id: string, level = 0): number {
  for (const c of roots) {
    if (c.id === id) return level;
    if (c.replies) {
      const found = getLevel(c.replies, id, level + 1);
      if (found >= 0) return found;
    }
  }
  return 0;
}

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}
