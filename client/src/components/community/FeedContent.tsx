import React from 'react';
import { ContentResolver } from './renderers/ContentResolver';

interface FeedContentProps {
  posts: any[];
  isLoading: boolean;
}

export const FeedContent: React.FC<FeedContentProps> = ({ posts, isLoading }) => {
  return (
    <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Create Post Input Placeholder */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 flex items-center space-x-4 cursor-text">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0"></div>
        <div className="flex-1 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center px-4">
          <span className="text-gray-500 dark:text-gray-400 text-sm">Share your knowledge...</span>
        </div>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          // Advanced Skeleton Loader
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 animate-pulse">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                  <div className="h-2 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
              <div className="h-48 w-full bg-gray-200 dark:bg-gray-800 rounded-xl mb-4"></div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
              </div>
            </div>
          ))
        ) : posts.length === 0 ? (
          // Smart Empty State
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🌌</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">It's quiet here</h3>
            <p className="text-gray-500 dark:text-gray-400">Follow creators and join spaces to personalize your feed.</p>
          </div>
        ) : (
          posts.map(post => (
            <ContentResolver key={post.id} post={post} />
          ))
        )}
      </div>
    </div>
  );
};
