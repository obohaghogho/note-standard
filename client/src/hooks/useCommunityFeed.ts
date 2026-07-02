/**
 * useCommunityFeed — production-grade hook
 * Manages:
 *  - Paginated infinite feed (cursor-based)
 *  - Category/sort/search filtering
 *  - 5-minute local cache
 *  - Real-time new posts via socket
 *  - Offline flush on reconnect
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  CommunityPost,
  FeedResult,
} from '../services/communityService';
import {
  getFeed,
  getCachedFeed,
  setCachedFeed,
  flushOfflineQueue,
} from '../services/communityService';
import { useSocket } from '../context/SocketContext';

interface FeedParams {
  tab: string;
  category?: string;
  sort?: string;
  search?: string;
}

export function useCommunityFeed(params: FeedParams) {
  const { socket } = useSocket();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | undefined>(undefined);
  const paramsRef = useRef(params);

  // Keep params ref in sync
  useEffect(() => { paramsRef.current = params; }, [params]);

  const cacheKey = `${params.tab}:${params.category || ''}:${params.sort || ''}`;

  // ── Initial / refresh load ────────────────────────────────────────────────
  const loadFeed = useCallback(async (fromCache = true) => {
    setIsLoading(true);
    setError(null);
    cursorRef.current = undefined;

    if (fromCache) {
      const cached = getCachedFeed(cacheKey);
      if (cached) {
        setPosts(cached.posts);
        setHasMore(cached.hasMore);
        cursorRef.current = cached.nextCursor;
        setIsLoading(false);
        // Refresh in background
        loadFeed(false);
        return;
      }
    }

    try {
      const result: FeedResult = await getFeed({
        tab: paramsRef.current.tab,
        category: paramsRef.current.category,
        sort: paramsRef.current.sort,
        search: paramsRef.current.search,
        limit: 20,
      });
      setPosts(result.posts);
      setHasMore(result.hasMore);
      cursorRef.current = result.nextCursor;
      setCachedFeed(cacheKey, result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey]);

  // ── Load more (infinite scroll) ───────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    try {
      const result: FeedResult = await getFeed({
        tab: paramsRef.current.tab,
        category: paramsRef.current.category,
        sort: paramsRef.current.sort,
        search: paramsRef.current.search,
        limit: 20,
        cursor: cursorRef.current,
      });
      setPosts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newPosts = result.posts.filter(p => !existingIds.has(p.id));
        return [...prev, ...newPosts];
      });
      setHasMore(result.hasMore);
      cursorRef.current = result.nextCursor;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setIsFetchingMore(false);
    }
  }, [hasMore, isFetchingMore]);

  // ── Refresh (pull-to-refresh) ─────────────────────────────────────────────
  const refresh = useCallback(() => loadFeed(false), [loadFeed]);

  // ── Real-time: prepend new posts from socket ──────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.emit('community:join_feed');

    const handleNewPost = ({ post }: { post: CommunityPost }) => {
      setPosts(prev => {
        if (prev.find(p => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    };

    const handlePostDeleted = ({ postId }: { postId: string }) => {
      setPosts(prev => prev.filter(p => p.id !== postId));
    };

    const handlePostEdited = ({ postId, updates }: { postId: string; updates: Partial<CommunityPost> }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
    };

    const handleLikeToggled = ({ postId, count }: { postId: string; isLiked: boolean; count: number }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: count } : p));
    };

    socket.on('community:post_created', handleNewPost);
    socket.on('community:post_deleted', handlePostDeleted);
    socket.on('community:post_edited', handlePostEdited);
    socket.on('community:like_toggled', handleLikeToggled);

    return () => {
      socket.emit('community:leave_feed');
      socket.off('community:post_created', handleNewPost);
      socket.off('community:post_deleted', handlePostDeleted);
      socket.off('community:post_edited', handlePostEdited);
      socket.off('community:like_toggled', handleLikeToggled);
    };
  }, [socket]);

  // ── Flush offline queue when reconnecting ─────────────────────────────────
  useEffect(() => {
    const handler = () => flushOfflineQueue();
    window.addEventListener('online', handler);
    // Also flush immediately if already online
    if (navigator.onLine) flushOfflineQueue();
    return () => window.removeEventListener('online', handler);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadFeed(true);
  }, [loadFeed]);

  // ── Optimistic updates ────────────────────────────────────────────────────
  const optimisticLike = useCallback((postId: string, currentLiked: boolean) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return {
        ...p,
        likes_count: (p.likes_count || 0) + (currentLiked ? -1 : 1),
      };
    }));
  }, []);

  const optimisticBookmark = useCallback((postId: string, currentBookmarked: boolean) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return { ...p, saves_count: (p.saves_count || 0) + (currentBookmarked ? -1 : 1) };
    }));
  }, []);

  const prependPost = useCallback((post: CommunityPost) => {
    setPosts(prev => [post, ...prev]);
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  return {
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
  };
}
