import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, X, Edit3, Trash2, Reply } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import type { CommunityComment } from '../../services/communityService';
import {
  getComments,
  addComment,
  editComment,
  deleteComment,
} from '../../services/communityService';

interface Props {
  postId: string;
  onCommentAdded?: () => void;
  onCommentDeleted?: () => void;
}

interface CommentItemProps {
  comment: CommunityComment;
  postId: string;
  level?: number;
  onReply: (parentId: string, username: string) => void;
  onDeleted: (id: string) => void;
  onEdited: (updated: CommunityComment) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, postId, level = 0, onReply, onDeleted, onEdited }) => {
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

  return (
    <div className={`${level > 0 ? 'ml-8 border-l-2 border-gray-100 dark:border-gray-800 pl-4' : ''}`}>
      <div className="flex items-start gap-2.5 py-3">
        <img
          src={comment.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${comment.profiles?.username || 'U'}&background=6366f1&color=fff`}
          alt={comment.profiles?.username}
          className="w-8 h-8 rounded-full object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {comment.profiles?.username || 'User'}
            </span>
            {comment.is_edited && (
              <span className="text-xs text-gray-400 italic">edited</span>
            )}
          </div>

          {editMode ? (
            <div className="flex gap-2 mt-1">
              <input
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                autoFocus
              />
              <button onClick={handleSaveEdit} className="text-xs text-blue-600 dark:text-blue-400 font-medium px-2">Save</button>
              <button onClick={() => setEditMode(false)} className="text-xs text-gray-400 px-1">Cancel</button>
            </div>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{comment.content}</p>
          )}

          <div className="flex items-center gap-3 mt-1.5">
            <button
              onClick={() => onReply(comment.id, comment.profiles?.username || 'User')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <Reply size={12} /> Reply
            </button>
            {isOwner && !editMode && (
              <>
                <button onClick={() => setEditMode(true)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                  <Edit3 size={12} /> Edit
                </button>
                <button onClick={handleDelete} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                  <Trash2 size={12} /> Delete
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
        />
      ))}
    </div>
  );
};

export const CommentSection: React.FC<Props> = ({ postId, onCommentAdded, onCommentDeleted }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load comments ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getComments(postId);
        if (!cancelled) setComments(buildTree(data));
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
      setComments(prev => {
        if (prev.find(c => c.id === comment.id)) return prev;
        onCommentAdded?.();
        return [...prev, comment];
      });
    };

    const handleSocketCommentDeleted = ({ commentId }: { commentId: string }) => {
      setComments(prev => {
        if (prev.find(c => c.id === commentId)) {
          onCommentDeleted?.();
          return prev.filter(c => c.id !== commentId);
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
      setComments(prev => [...prev, comment]);
      setText('');
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
    setComments(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setComments(prev => {
      if (prev.find(c => c.id === id)) {
        onCommentDeleted?.();
        return prev.filter(c => c.id !== id);
      }
      return prev;
    });
  }, [onCommentDeleted]);

  const flat = flattenTree(comments);

  return (
    <div className="px-4 sm:px-5 pb-4">
      {loading ? (
        <div className="py-6 text-center text-xs text-gray-400">Loading comments…</div>
      ) : flat.length === 0 ? (
        <div className="py-6 text-center text-xs text-gray-400">No comments yet. Be the first!</div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
          {flat.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postId={postId}
              level={getLevel(comments, comment.id)}
              onReply={handleReply}
              onDeleted={handleDeleted}
              onEdited={handleEdited}
            />
          ))}
        </div>
      )}

      {/* Input */}
      {user && (
        <div className="mt-3 flex items-start gap-2.5">
          <img
            src={`https://ui-avatars.com/api/?name=U&background=6366f1&color=fff`}
            alt="You"
            className="w-8 h-8 rounded-full shrink-0"
          />
          <div className="flex-1 relative">
            {replyTo && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 mb-1">
                <Reply size={11} /> Replying to @{replyTo.username}
                <button onClick={() => { setReplyTo(null); setText(''); }} className="ml-1 text-gray-400 hover:text-gray-600">
                  <X size={11} />
                </button>
              </div>
            )}
            <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 pr-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Write a comment…"
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white px-4 py-2 focus:outline-none"
                maxLength={2000}
              />
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
                className="p-2 rounded-full text-blue-600 dark:text-blue-400 disabled:opacity-30 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
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
