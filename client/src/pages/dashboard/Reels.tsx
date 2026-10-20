import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ReelCard, type ReelPost } from '../../components/community/ReelCard';
import { ReelUploadModal } from '../../components/community/ReelUploadModal';
import { CommentSection } from '../../components/community/CommentSection';
import { Loader2, Plus, Sparkles, Video, X, MessageCircle, Send, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { API_URL, getAuthHeader } from '../../lib/api';
import { deletePost, recordReelView } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';
import { useKeyboardLayout } from '../../hooks/useKeyboardLayout';

export const Reels: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isKeyboardOpen } = useKeyboardLayout();
  const [reels, setReels] = useState<ReelPost[]>([]);
  const [loading, setLoading] = useState(true);

  const handleBookmarkToggle = useCallback((reelId: string, currentBookmarked: boolean) => {
    setReels(prev =>
      prev.map(r =>
        r.id === reelId
          ? {
              ...r,
              user_has_bookmarked: !currentBookmarked,
              is_bookmarked: !currentBookmarked,
              saves_count: Math.max(0, (r.saves_count || 0) + (currentBookmarked ? -1 : 1)),
            }
          : r
      )
    );
  }, []);

  const handleLikeToggle = useCallback((reelId: string, isLiked: boolean) => {
    setReels(prev =>
      prev.map(r => {
        if (r.id !== reelId) return r;
        const currentLiked = Boolean(r.user_has_liked || r.is_liked);
        if (currentLiked === isLiked) return r;
        return {
          ...r,
          user_has_liked: isLiked,
          is_liked: isLiked,
          likes_count: Math.max(0, (r.likes_count || 0) + (isLiked ? 1 : -1)),
        };
      })
    );
  }, []);

  const handleBackNav = useCallback(() => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  }, [navigate]);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCommentsReelId, setSelectedCommentsReelId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const trackedSessionViewsRef = useRef<Set<string>>(new Set());
  const [searchParams] = useSearchParams();
  const targetReelId = searchParams.get('id');

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

  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

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
      const authHeaders = await getAuthHeader();
      const res = await fetch(`${API_URL}/api/community/reels?limit=20`, {
        headers: { ...authHeaders },
      });
      let list: ReelPost[] = [];
      if (res.ok) {
        const data = await res.json();
        list = data.reels || [];
        setHasMore(Boolean(data.hasMore));
        setNextCursor(data.nextCursor || null);
      }

      // Target Reel Deep-Link Resolution (Repair B)
      if (targetReelId) {
        const foundIdx = list.findIndex(r => r.id === targetReelId);
        if (foundIdx >= 0) {
          setReels(list);
          setActiveReelId(targetReelId);
        } else {
          // Target reel not in newest 20 - fetch it specifically
          try {
            const targetRes = await fetch(`${API_URL}/api/community/post/${encodeURIComponent(targetReelId)}`, {
              headers: { ...authHeaders },
            });
            if (targetRes.ok) {
              const targetData = await targetRes.json();
              const targetPost = targetData.post || targetData;
              const hasVideo = targetPost && (targetPost.media_url || (Array.isArray(targetPost.media_urls) && targetPost.media_urls.length > 0));
              if (hasVideo) {
                const formattedTarget: ReelPost = {
                  id: targetPost.id,
                  author_id: targetPost.author_id,
                  content: targetPost.content || targetPost.title || '',
                  media_url: targetPost.media_url || targetPost.media_urls?.[0],
                  thumbnail_url: targetPost.thumbnail_url || null,
                  likes_count: targetPost.likes_count || 0,
                  comments_count: targetPost.comments_count || 0,
                  saves_count: targetPost.saves_count || 0,
                  shares_count: targetPost.shares_count || 0,
                  views_count: targetPost.views_count || 0,
                  user_has_liked: Boolean(targetPost.user_has_liked),
                  user_has_bookmarked: Boolean(targetPost.user_has_bookmarked || targetPost.is_bookmarked),
                  is_bookmarked: Boolean(targetPost.is_bookmarked || targetPost.user_has_bookmarked),
                  created_at: targetPost.created_at,
                  author: targetPost.author || targetPost.profiles,
                  profiles: targetPost.profiles || targetPost.author,
                };
                list = [formattedTarget, ...list.filter(r => r.id !== targetReelId)];
                setReels(list);
                setActiveReelId(targetReelId);
              } else {
                setReels(list);
                if (list.length > 0) setActiveReelId(list[0].id);
                toast.error('The requested Reel is unavailable or has no video.');
              }
            } else {
              setReels(list);
              if (list.length > 0) setActiveReelId(list[0].id);
              toast.error('The requested Reel could not be found.');
            }
          } catch {
            setReels(list);
            if (list.length > 0) setActiveReelId(list[0].id);
          }
        }
      } else {
        setReels(list);
        if (list.length > 0) {
          setActiveReelId(list[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching reels:', err);
    } finally {
      setLoading(false);
    }
  }, [targetReelId]);

  const fetchMoreReels = useCallback(async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    try {
      setLoadingMore(true);
      const authHeaders = await getAuthHeader();
      const res = await fetch(`${API_URL}/api/community/reels?limit=20&cursor=${encodeURIComponent(nextCursor)}`, {
        headers: { ...authHeaders },
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

  // Auto-scroll to target deep-link reel on load
  useLayoutEffect(() => {
    if (targetReelId && reels.length > 0) {
      const el = cardRefs.current.get(targetReelId);
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  }, [targetReelId, reels]);

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
              window.history.replaceState(null, '', `/dashboard/reels?id=${encodeURIComponent(reelId)}`);
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

  // Shared navigation helper
  const navigateToReel = useCallback((direction: 'next' | 'prev') => {
    const currentIdx = reels.findIndex(r => r.id === activeReelId);
    const safeIdx = currentIdx >= 0 ? currentIdx : 0;
    if (direction === 'next' && safeIdx < reels.length - 1) {
      const target = reels[safeIdx + 1];
      const el = cardRefs.current.get(target.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveReelId(target.id); }
    } else if (direction === 'prev' && safeIdx > 0) {
      const target = reels[safeIdx - 1];
      const el = cardRefs.current.get(target.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveReelId(target.id); }
    }
  }, [reels, activeReelId]);

  // Desktop Wheel and Trackpad navigation.
  // Throttle state lives in refs so it survives re-renders and active-reel changes;
  // the listener reads the latest navigator through a ref instead of re-registering.
  const navigateToReelRef = useRef(navigateToReel);

  useLayoutEffect(() => {
    navigateToReelRef.current = navigateToReel;
  });
  const wheelLockRef = useRef(false);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (selectedCommentsReelId || showUploadModal) return;

      const LINE_PX = 40;
      const PAGE_PX = 200;
      const normalizedDelta =
        e.deltaMode === 1 ? e.deltaY * LINE_PX :
        e.deltaMode === 2 ? e.deltaY * PAGE_PX :
        e.deltaY;

      if (Math.abs(normalizedDelta) < 20) return;
      e.preventDefault();

      // Release the lock 400ms after the last wheel event of the gesture,
      // so trackpad inertia cannot trigger a second navigation.
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => { wheelLockRef.current = false; }, 400);

      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      navigateToReelRef.current(normalizedDelta > 0 ? 'next' : 'prev');
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [selectedCommentsReelId, showUploadModal]);

  // Desktop Keyboard navigation (ArrowDown, ArrowUp, PageDown, PageUp, Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedCommentsReelId || showUploadModal) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
      if (target?.isContentEditable) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        navigateToReel('next');
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        navigateToReel('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateToReel, selectedCommentsReelId, showUploadModal]);

  // Comments Drawer handler
  const handleOpenComments = (reelId: string) => {
    setSelectedCommentsReelId(reelId);
  };

  const activeIndex = reels.findIndex(r => r.id === activeReelId);
  const safeActiveIdx = activeIndex >= 0 ? activeIndex : 0;
  const canGoNext = safeActiveIdx < reels.length - 1;
  const canGoPrev = safeActiveIdx > 0;

  return (
    <div className="relative w-full h-full min-h-0 bg-black flex flex-col overflow-hidden">
      {/* Floating Top Branding & Action Overlay.
           top and padding-top mirror the safe-area-inset-top so the rendered height
           is deterministic — ReelCard controls use the same calc() baseline. */}
      <div
        className="absolute left-3 right-3 sm:left-4 sm:right-4 z-50 flex items-center justify-between pointer-events-none gap-2"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={handleBackNav}
            aria-label="Back to dashboard"
            title="Back to dashboard"
            className="flex items-center justify-center bg-black/60 backdrop-blur-md hover:bg-white/20 border border-white/20 text-white rounded-full min-w-[44px] min-h-[44px] transition-all active:scale-95 cursor-pointer shadow-xl"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full border border-white/20 shadow-xl text-white font-bold text-xs sm:text-sm">
            <Sparkles className="text-yellow-400 shrink-0" size={15} />
            <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              <span className="hidden xs:inline sm:inline">NoteStandard </span>Reels
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 via-primary to-purple-600 hover:brightness-110 text-white px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-semibold shadow-xl shadow-primary/30 transition-all active:scale-95 cursor-pointer pointer-events-auto shrink-0"
        >
          <Plus size={15} />
          <span>Post Reel</span>
        </button>
      </div>

      {/* Right-side Navigation Arrows — desktop/tablet only; hidden on mobile where swipe is the primary nav method */}
      {reels.length > 1 && !loading && (
        <div className="absolute right-3 sm:right-4 z-50 hidden sm:flex flex-col gap-2 pointer-events-none"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <button
            onClick={() => navigateToReel('prev')}
            disabled={!canGoPrev}
            aria-label="Previous reel"
            title="Previous reel (↑)"
            className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl transition-all hover:bg-white/20 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp size={22} />
          </button>

          {/* Dot indicator */}
          <div className="flex flex-col items-center gap-1 py-1 pointer-events-none">
            {reels.slice(Math.max(0, safeActiveIdx - 2), Math.min(reels.length, safeActiveIdx + 3)).map((r, i) => {
              const realIdx = Math.max(0, safeActiveIdx - 2) + i;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    const el = cardRefs.current.get(r.id);
                    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveReelId(r.id); }
                  }}
                  className={`pointer-events-auto w-1.5 rounded-full transition-all duration-300 ${
                    realIdx === safeActiveIdx ? 'h-4 bg-white' : 'h-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Go to reel ${realIdx + 1}`}
                />
              );
            })}
          </div>

          <button
            onClick={() => navigateToReel('next')}
            disabled={!canGoNext}
            aria-label="Next reel"
            title="Next reel (↓)"
            className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl transition-all hover:bg-white/20 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown size={22} />
          </button>
        </div>
      )}

      {/* Main Full-Height Snap-Scroll Container */}
      <div
        ref={containerRef}
        tabIndex={0}
        className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-none outline-none flex-1 min-h-0"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
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
          reels.map((reel, index) => {
            const isInResourceWindow = Math.abs(index - safeActiveIdx) <= 1;
            return (
              <div
                key={reel.id}
                data-reel-id={reel.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(reel.id, el);
                  else cardRefs.current.delete(reel.id);
                }}
                className="w-full snap-start snap-always shrink-0 flex items-center justify-center"
                style={{ height: '100%', minHeight: '100%' }}
              >
                <ReelCard
                  reel={reel}
                  isActive={activeReelId === reel.id}
                  isInResourceWindow={isInResourceWindow}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  onOpenComments={handleOpenComments}
                  onLikeToggle={handleLikeToggle}
                  onBookmarkToggle={handleBookmarkToggle}
                  onDeleteReel={handleDeleteReel}
                  onRecordView={handleRecordView}
                />
              </div>
            );
          })
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
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex justify-end flex-col sm:items-center sm:justify-center p-0 sm:p-4 pt-[max(4.5rem,calc(env(safe-area-inset-top,0px)+2rem))] sm:pt-4"
          style={{
            position: 'fixed',
            top: 'var(--vv-top, 0px)',
            left: 0,
            right: 0,
            bottom: 'auto',
            height: 'var(--vv-height, 100dvh)',
            maxHeight: 'var(--vv-height, 100dvh)',
          }}
        >
          <div
            className="bg-gray-900 border border-white/10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[75vh] h-[70vh] sm:h-[65vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300 pb-[env(safe-area-inset-bottom,0px)]"
            style={{
              maxHeight: 'calc(var(--vv-height, 100dvh) - max(4.5rem, calc(env(safe-area-inset-top, 0px) + 2rem)))',
            }}
          >
            {/* Sheet Handle for Mobile */}
            <div className="sm:hidden flex justify-center pt-3 pb-1.5 shrink-0">
              <div className="w-10 h-1.5 bg-gray-600 rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <MessageCircle size={18} className="text-primary" />
                <span>Comments</span>
              </div>
              <button
                onClick={() => setSelectedCommentsReelId(null)}
                className="p-2 -mr-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Close comments"
                aria-label="Close comments"
              >
                <X size={20} />
              </button>
            </div>

            {/* Comments Body with full thread hierarchy & real-time sockets */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <CommentSection
                postId={selectedCommentsReelId}
                onCommentAdded={() => {
                  setReels(prev =>
                    prev.map(r =>
                      r.id === selectedCommentsReelId
                        ? { ...r, comments_count: (r.comments_count || 0) + 1 }
                        : r
                    )
                  );
                }}
                onCommentDeleted={() => {
                  setReels(prev =>
                    prev.map(r =>
                      r.id === selectedCommentsReelId
                        ? { ...r, comments_count: Math.max(0, (r.comments_count || 0) - 1) }
                        : r
                    )
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Reels;
