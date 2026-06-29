import React from 'react';

export const FeedSidebar: React.FC = () => {
  return (
    <div className="p-4 space-y-6">
      {/* Trending Spaces Widget */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Trending Spaces</h3>
        <div className="space-y-3">
          {/* Skeletons for now */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div className="flex-1">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
              <div className="h-2 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested Creators Widget */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Suggested Creators</h3>
        <div className="space-y-3">
           <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div className="flex-1">
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
              <div className="h-2 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer Links */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-6 px-1">
        <a href="#" className="hover:underline">About</a>
        <a href="#" className="hover:underline">Help</a>
        <a href="#" className="hover:underline">Terms</a>
        <a href="#" className="hover:underline">Privacy</a>
        <span className="w-full mt-2">© 2026 NoteStandard</span>
      </div>
    </div>
  );
};
