import React, { useState } from 'react';
import { Plus, Edit3, Image, HelpCircle, FileText, Link as LinkIcon } from 'lucide-react';

export const FeedFAB: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  // In a real implementation, we would use long-press on mobile
  return (
    <div className="relative" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
      {/* Expanded Menu Options */}
      <div className={`absolute bottom-full right-0 mb-4 flex flex-col items-end space-y-3 transition-all duration-200 ${isOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}`}>
        <button className="flex items-center group">
          <span className="mr-3 px-3 py-1 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">Share Link</span>
          <div className="p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 hover:text-blue-500 hover:border-blue-200 transition-all">
            <LinkIcon size={20} />
          </div>
        </button>
        <button className="flex items-center group">
          <span className="mr-3 px-3 py-1 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">Upload Media</span>
          <div className="p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 hover:text-blue-500 hover:border-blue-200 transition-all">
            <Image size={20} />
          </div>
        </button>
        <button className="flex items-center group">
          <span className="mr-3 px-3 py-1 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">Ask Question</span>
          <div className="p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 hover:text-blue-500 hover:border-blue-200 transition-all">
            <HelpCircle size={20} />
          </div>
        </button>
        <button className="flex items-center group">
          <span className="mr-3 px-3 py-1 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">Create Note</span>
          <div className="p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 hover:text-blue-500 hover:border-blue-200 transition-all">
            <FileText size={20} />
          </div>
        </button>
      </div>

      {/* Main Button */}
      <button className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl shadow-blue-500/30 transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
        <Plus size={24} className={`transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} />
      </button>
    </div>
  );
};
