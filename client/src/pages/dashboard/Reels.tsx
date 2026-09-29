import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ReelCard, type ReelPost } from '../../components/community/ReelCard';
import { ReelUploadModal } from '../../components/community/ReelUploadModal';
import { Loader2, Plus, Sparkles, Video, RefreshCw, X, MessageCircle, Send } from 'lucide-react';
import { API_URL } from '../../lib/api';
import { deletePost, recordReelView } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

export const Reels: React.FC = () => {
  const { user, profile } = useAuth();
  const [reels, setReels] = useState<ReelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCommentsReelId, setSelectedCommentsReelId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const trackedSessionViewsRef = useRef<Set<string>>(new Set());

  // Extract current authenticated user information from AuthContext & fallback
  const storedUserStr = localStorage.getItem('user');
  let currentUserId = user?.id || '';
  let currentUserRole = profile?.role || (user as any)?.role || '';
  if (!currentUserId && storedUserStr) {
    try {
      const parsed = JSON.parse(storedUserStr);
      currentUserId = parsed.id || parsed.user_id || '';
      currentUserRole = currentUserRole || parsed.role || '';
    } catch {}
  }

  const [isMuted, setIsMuted] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handleRecordView = useCallback(async (reelId: string, metadata?: { watch_duration_seconds?: number; is_muted?: boolean; completed?: boolean }) => {
    if (trackedSessionViewsRef.current.has(reelId)) return;
    trackedSessionViewsRef.current.add(reelId);

    try {
      const res = await recordReelView(reelId, metadata);
      if (res && res.success && typeof res.views_count === 'number') {
        setReels(prev =>
          prev.map(r =>
            r.id === reelId
              ? { ...r, views_count: res.views_count }
              : r
          )
        );
      }
    } catch {
      // Non-blocking failure guarantee: Fail silently if analytics endpoint drops
    }
  }, []);


  const handleDeleteReel = async (reelId: string) => {
    try {
      await deletePost(reelId);
      setReels(prev => prev.filter(r => r.id !== reelId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete Reel.');
    }
  };

  const fetchReels = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/community/reels?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.reels || [];
        setReels(list);
        setHasMore(Boolean(data.hasMore));
        setNextCursor(data.nextCursor || null);
        if (list.length > 0) {
          setActiveReelId(list[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching reels:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMoreReels = useCallback(async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    try {
      setLoadingMore(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/community/reels?limit=20&cursor=${encodeURIComponent(nextCursor)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const newList: ReelPost[] = data.reels || [];
        setReels(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const filteredNew = newList.filter(r => !existingIds.has(r.id));
          return [...prev, ...filteredNew];
        });
        setHasMore(Boolean(data.hasMore));
        setNextCursor(data.nextCursor || null);
      }
    } catch (err) {
      console.error('Error fetching more reels:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor]);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  // IntersectionObserver to auto-activate the reel visible in viewport center
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const reelId = entry.target.getAttribute('data-reel-id');
            if (reelId) {
              setActiveReelId(reelId);
              const activeIdx = reels.findIndex(r => r.id === reelId);
              if (activeIdx >= 0 && activeIdx >= reels.length - 3) {
                fetchMoreReels();
              }
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.6,
      }
    );

    cardRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [reels, fetchMoreReels]);

  // Comments Drawer handler
  const handleOpenComments = async (reelId: string) => {
    setSelectedCommentsReelId(reelId);
    setLoadingComments(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/community/post/${reelId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data || []);
      }
    } catch (err) {
      console.error('Error fetching reel comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !selectedCommentsReelId) return;

    setSubmittingComment(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/community/comment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: selectedCommentsReelId,
          content: newCommentText.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setComments(prev => [...prev, data.comment || data]);
        setNewCommentText('');
        // Update comments count on reel
        setReels(prev =>
          prev.map(r =>
            r.id === selectedCommentsReelId
              ? { ...r, comments_count: (r.comments_count || 0) + 1 }
              : r
          )
        );
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="relative w-full h-[calc(100dvh-4rem)] lg:h-[calc(100vh-4rem)] bg-black flex flex-col overflow-hidden">
      {/* Floating Top Branding & Action Overlay */}
      <div className="absolute top-3 left-3 right-3 sm:left-4 sm:right-4 z-40 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 shadow-xl text-white font-bold text-xs sm:text-sm pointer-events-auto">
          <Sparkles className="text-yellow-400 shrink-0" size={15} />
          <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">NoteStandard Reels</span>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 via-primary to-purple-600 hover:brightness-110 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-xl shadow-primary/30 transition-all active:scale-95 cursor-pointer pointer-events-auto"
        >
          <Plus size={15} />
          <span>Post Reel</span>
        </button>
      </div>

      {/* Main Full-Height Snap-Scroll Container */}
      <div
        ref={containerRef}
        className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-none p-0 sm:py-3"
      >
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm font-medium">Loading NoteStandard Reels...</p>
          </div>
        ) : reels.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-4">
            <div className="p-4 rounded-full bg-white/5 text-primary">
              <Video size={48} />
            </div>
            <h3 className="text-lg font-bold text-white">No Reels Posted Yet</h3>
            <p className="text-xs sm:text-sm max-w-sm text-gray-400">
              Be the first to share a short vertical video note, tutorial, or study tip with the community!
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shadow-lg flex items-center gap-2"
            >
              <Plus size={18} /> Create First Reel
            </button>
          </div>
        ) : (
          (() => {
            const activeIndex = reels.findIndex(r => r.id === activeReelId);
            const safeActiveIdx = activeIndex >= 0 ? activeIndex : 0;
            return reels.map((reel, index) => {
              const isInResourceWindow = Math.abs(index - safeActiveIdx) <= 1;
              return (
                <div
                  key={reel.id}
                  data-reel-id={reel.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(reel.id, el);
                    else cardRefs.current.delete(reel.id);
                  }}
                  className="w-full h-full flex items-center justify-center p-0 sm:p-2 snap-start shrink-0 my-auto"
                >
                  <ReelCard
                    reel={reel}
                    isActive={activeReelId === reel.id}
                    isMuted={isMuted}
                    onToggleMute={handleToggleMute}
                    isInResourceWindow={isInResourceWindow}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    onOpenComments={handleOpenComments}
                    onDeleteReel={handleDeleteReel}
                    onRecordView={handleRecordView}
                  />
                </div>
              );
            });
          })()
        )}
      </div>

      {/* Reel Upload Modal */}
      {showUploadModal && (
        <ReelUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            fetchReels();
          }}
        />
      )}

      {/* Slide-Up Comment Drawer */}
      {selectedCommentsReelId && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCommentsReelId(null);
          }}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex justify-end flex-col sm:items-center sm:justify-center p-0 sm:p-4"
        >
          <div className="bg-gray-900 border border-white/10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl h-[70vh] sm:h-[65vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <MessageCircle size={18} className="text-primary" />
                <span>Comments</span>
              </div>
              <button
                onClick={() => setSelectedCommentsReelId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                title="Close comments"
              >
                <X size={20} />
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingComments ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center text-xs text-gray-500 py-10">
                  No comments yet. Start the conversation!
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5 items-start">
                    <img
                      src={
                        c.profiles?.avatar_url ||
                        `https://ui-avatars.com/api/?name=${c.profiles?.username || 'U'}&background=6366f1&color=fff`
                      }
                      alt={c.profiles?.username}
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                    />
                    <div className="flex-1 bg-white/5 rounded-xl p-2.5 border border-white/5">
                      <div className="font-semibold text-xs text-white">
                        @{c.profiles?.username || 'user'}
                      </div>
                      <p className="text-xs text-gray-300 mt-1 leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input Form */}
            <form onSubmit={handlePostComment} className="p-3 sm:p-4 bg-gray-950 border-t border-white/10 flex gap-2 shrink-0">
              <label htmlFor="reel-comment-input" className="sr-only">Add a comment</label>
              <input
                id="reel-comment-input"
                name="reel_comment"
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Add a comment to this Reel..."
                aria-label="Add a comment to this Reel"
                className="flex-1 bg-black/60 border border-white/15 rounded-full px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={submittingComment || !newCommentText.trim()}
                className="p-2.5 rounded-full bg-primary hover:bg-primary/90 text-white disabled:opacity-50 transition-all cursor-pointer shrink-0"
              >
                {submittingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default Reels;
