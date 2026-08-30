import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedLayout } from '../../components/community/FeedLayout';
import { FeedHeader } from '../../components/community/FeedHeader';
import { FeedTabs } from '../../components/community/FeedTabs';
import { FeedFilters } from '../../components/community/FeedFilters';
import { FeedSearch } from '../../components/community/FeedSearch';
import { FeedContent } from '../../components/community/FeedContent';
import { FeedSidebar } from '../../components/community/FeedSidebar';
import { FeedFAB } from '../../components/community/FeedFAB';
import { PostComposer } from '../../components/community/PostComposer';
import { useCommunityFeed } from '../../hooks/useCommunityFeed';
import { useAuth } from '../../context/AuthContext';
import type { CommunityPost } from '../../services/communityService';
import { RefreshCw } from 'lucide-react';

const FEED_TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'reels', label: '🎬 Reels' },
  { id: 'latest', label: 'Latest' },
  { id: 'following', label: 'Following' },
  { id: 'saved', label: 'Saved' },
  { id: 'my-posts', label: 'My Posts' },
  { id: 'spaces', label: 'Spaces' },
];

export const Feed: React.FC = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('trending');
  const [filterState, setFilterState] = useState({ category: 'All', sort: 'latest' });
  const [search, setSearch] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);

  const {
    posts,
    isLoading,
    isFetchingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    optimisticLike,
    optimisticBookmark,
    prependPost,
    removePost,
  } = useCommunityFeed({
    tab: activeTab,
    category: filterState.category !== 'All' ? filterState.category : undefined,
    sort: filterState.sort,
    search: search || undefined,
  });

  // ── Infinite scroll (IntersectionObserver) ────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          loadMore();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, loadMore]);

  // ── Pull-to-refresh (touch) ───────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollTop <= 5 && e.touches[0].clientY < 200) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = 0;
    }
  }, []);

  const handleTouchEnd = useCallback(async (e: React.TouchEvent) => {
    if (touchStartY.current <= 0) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 120 && scrollTop <= 5) {
      setIsRefreshing(true);
      try {
        await refresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    touchStartY.current = 0;
  }, [refresh]);

  const navigate = useNavigate();

  const handleTabChange = useCallback((tab: string) => {
    if (tab === 'reels') {
      navigate('/dashboard/reels');
    } else {
      setActiveTab(tab);
    }
  }, [navigate]);

  const handleFilterChange = useCallback((state: { category: string; sort: string }) => {
    setFilterState(state);
  }, []);

  const handlePosted = useCallback((post: CommunityPost) => {
    prependPost(post);
    setShowComposer(false);
  }, [prependPost]);

  return (
    <>
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Pull-to-refresh indicator */}
        {isRefreshing && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-800 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 border border-gray-100 dark:border-gray-700">
            <RefreshCw size={14} className="animate-spin" />
            Refreshing…
          </div>
        )}

        <FeedLayout
          sidebar={
            <div className="py-4 h-full flex flex-col">
              <div className="px-4 mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">NoteStandard</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Knowledge Ecosystem</p>
              </div>
              <FeedSearch onSearch={setSearch} />
            </div>
          }
          content={
            <>
              <FeedHeader />
              <FeedTabs activeTab={activeTab} onTabChange={handleTabChange} tabs={FEED_TABS} />
              <FeedFilters onChange={handleFilterChange} />
              <FeedContent
                posts={posts}
                isLoading={isLoading}
                isFetchingMore={isFetchingMore}
                error={error}
                sentinelRef={sentinelRef}
                onOpenComposer={() => setShowComposer(true)}
                onDelete={removePost}
                onOptimisticLike={optimisticLike}
                onOptimisticBookmark={optimisticBookmark}
                currentUserAvatar={profile?.avatar_url}
                searchQuery={search}
              />
            </>
          }
          rightSidebar={<FeedSidebar />}
          fab={
            <FeedFAB
              onPosted={handlePosted}
            />
          }
        />
      </div>

      {/* Post composer (from "Share your knowledge..." click) */}
      {showComposer && (
        <PostComposer
          onClose={() => setShowComposer(false)}
          onPosted={handlePosted}
        />
      )}
    </>
  );
};

export default Feed;
