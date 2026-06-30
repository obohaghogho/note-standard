import React from 'react';
import { Loader2 } from 'lucide-react';
import { UniversalPostCard } from './UniversalPostCard';
import { CommunityPost } from '../../services/communityService';

interface Props {
  posts: CommunityPost[];
  isLoading: boolean;
  isFetchingMore: boolean;
  error: string | null;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onOpenComposer: () => void;
  onDelete: (id: string) => void;
  onOptimisticLike: (id: string, isLiked: boolean) => void;
  onOptimisticBookmark: (id: string, isBookmarked: boolean) => void;
  currentUserAvatar?: string;
}

const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 animate-pulse">
    <div className="flex items-center space-x-3 mb-4">
      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-2 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </div>
    <div className="space-y-2 mb-4">
      <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
      <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
      <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded" />
    </div>
    <div className="flex items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <div className="h-7 w-14 bg-gray-200 dark:bg-gray-800 rounded-full" />
      <div className="h-7 w-14 bg-gray-200 dark:bg-gray-800 rounded-full" />
      <div className="h-7 w-14 bg-gray-200 dark:bg-gray-800 rounded-full" />
    </div>
  </div>
);

export const FeedContent: React.FC<Props> = ({
  posts,
  isLoading,
  isFetchingMore,
  error,
  sentinelRef,
  onOpenComposer,
  onDelete,
  onOptimisticLike,
  onOptimisticBookmark,
  currentUserAvatar,
}) => {
  return (
    <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Create Post Button */}
      <button
        id="open-post-composer"
        onClick={onOpenComposer}
        className="w-full bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 flex items-center space-x-4 cursor-text hover:border-blue-300 dark:hover:border-blue-700 transition-colors text-left group"
      >
        <img
          src={currentUserAvatar || `https://ui-avatars.com/api/?name=U&background=6366f1&color=fff`}
          alt="You"
          className="w-10 h-10 rounded-full object-cover bg-gray-100 shrink-0"
        />
        <div className="flex-1 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 group-hover:border-blue-200 dark:group-hover:border-blue-700 flex items-center px-4 transition-colors">
          <span className="text-gray-500 dark:text-gray-400 text-sm">Share your knowledge…</span>
        </div>
      </button>

      {/* Error state */}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
          <p className="text-xs text-gray-400">Pull down to refresh</p>
        </div>
      )}

      {/* Posts */}
      <div className="space-y-5">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : posts.length === 0 && !error ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🌌</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Welcome to the Community!</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Discover ideas, share your knowledge, follow creators, and join spaces that match your interests. Your next great conversation starts here.
            </p>
            <button
              onClick={onOpenComposer}
              className="mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Create the first post
            </button>
          </div>
        ) : (
          posts.map(post => (
            <UniversalPostCard
              key={post.id}
              post={post}
              onDelete={onDelete}
              onOptimisticLike={onOptimisticLike}
              onOptimisticBookmark={onOptimisticBookmark}
            />
          ))
        )}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more spinner */}
      {isFetchingMore && (
        <div className="flex justify-center py-4">
          <Loader2 size={22} className="animate-spin text-blue-500" />
        </div>
      )}
    </div>
  );
};
