import { create } from 'zustand';
import { idbSet, idbGet, STORES } from '../lib/indexedDB';
import { offlineQueue } from '../lib/offlineQueue';

interface Post {
  id: string;
  [key: string]: unknown;
}

interface FeedState {
  // Data
  tabs: Record<string, Post[]>;
  cursors: Record<string, string | null>;
  
  // UI State
  activeTab: string;
  isLoading: boolean;
  isSyncing: boolean;
  
  // Actions
  setActiveTab: (tabId: string) => void;
  setPosts: (tabId: string, posts: Post[], cursor: string | null) => void;
  appendPosts: (tabId: string, posts: Post[], cursor: string | null) => void;
  
  // Optimistic Mutations
  optimisticLike: (postId: string) => void;
  optimisticSave: (postId: string) => void;
  
  // Cache Lifecycle
  loadCache: (tabId: string) => Promise<void>;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  tabs: {},
  cursors: {},
  activeTab: 'trending',
  isLoading: true,
  isSyncing: false,

  setActiveTab: (tabId) => {
    set({ activeTab: tabId });
    // Trigger cache load when switching tabs
    get().loadCache(tabId);
  },

  setPosts: async (tabId, posts, cursor) => {
    set((state) => ({
      tabs: { ...state.tabs, [tabId]: posts },
      cursors: { ...state.cursors, [tabId]: cursor },
      isLoading: false
    }));
    // Background persist to IndexedDB
    await idbSet(STORES.FEED_CACHE, { tabId, posts, cursor, timestamp: Date.now() });
  },

  appendPosts: async (tabId, newPosts, cursor) => {
    set((state) => {
      // De-duplicate
      const existing = state.tabs[tabId] || [];
      const existingIds = new Set(existing.map(p => p.id));
      const filteredNew = newPosts.filter(p => !existingIds.has(p.id));
      
      const combined = [...existing, ...filteredNew];
      
      return {
        tabs: { ...state.tabs, [tabId]: combined },
        cursors: { ...state.cursors, [tabId]: cursor }
      };
    });
    
    // Update cache
    const currentPosts = get().tabs[tabId];
    await idbSet(STORES.FEED_CACHE, { tabId, posts: currentPosts, cursor, timestamp: Date.now() });
  },

  optimisticLike: (postId) => {
    const tabId = get().activeTab;
    
    // 1. Mutate local state instantly
    set((state) => {
      const posts = state.tabs[tabId] || [];
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            user_has_liked: !post.user_has_liked,
            likes_count: post.user_has_liked ? (post.likes_count || 1) - 1 : (post.likes_count || 0) + 1
          };
        }
        return post;
      });
      return { tabs: { ...state.tabs, [tabId]: updatedPosts } };
    });

    // 2. Queue for background sync
    offlineQueue.enqueue('TOGGLE_LIKE', { postId });
  },

  optimisticSave: (postId) => {
    const tabId = get().activeTab;
    set((state) => {
      const posts = state.tabs[tabId] || [];
      const updatedPosts = posts.map(post => {
        if (post.id === postId) {
          return { ...post, user_has_saved: !post.user_has_saved };
        }
        return post;
      });
      return { tabs: { ...state.tabs, [tabId]: updatedPosts } };
    });
    offlineQueue.enqueue('TOGGLE_SAVE', { postId });
  },

  loadCache: async (tabId) => {
    try {
      const cache = await idbGet(STORES.FEED_CACHE, tabId);
      if (cache && cache.posts) {
        set((state) => ({
          tabs: { ...state.tabs, [tabId]: cache.posts },
          cursors: { ...state.cursors, [tabId]: cache.cursor },
          isLoading: false
        }));
      }
    } catch (err) {
      console.error('[FeedStore] Failed to load cache', err);
    }
  }
}));
