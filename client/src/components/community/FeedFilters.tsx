import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

export const FeedFilters: React.FC = () => {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800/60 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
      <div className="flex items-center space-x-2 overflow-x-auto hide-scrollbar">
        {/* Placeholder for dynamic tags */}
        <span className="px-3 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-medium cursor-pointer">All</span>
        <span className="px-3 py-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 rounded-full text-xs font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">Technology</span>
        <span className="px-3 py-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 rounded-full text-xs font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">Business</span>
      </div>
      <button className="ml-2 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
        <SlidersHorizontal size={16} />
      </button>
    </div>
  );
};
