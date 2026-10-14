import React from 'react';

export const FeedHeader: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800/80 px-3.5 sm:px-4 py-2 sm:py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight">Community</h1>
          <span className="hidden xs:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            Feed
          </span>
        </div>
      </div>
    </header>
  );
};
