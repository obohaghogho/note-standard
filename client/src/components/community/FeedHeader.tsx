import React from 'react';

export const FeedHeader: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Community</h1>
        {/* Placeholder for future header actions, like mobile search icon */}
      </div>
    </header>
  );
};
