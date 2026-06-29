import React from 'react';
import { Settings, PenTool, Search, Layout } from 'lucide-react';

interface TabConfig {
  id: string;
  label: string;
}

interface FeedTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: TabConfig[];
}

export const FeedTabs: React.FC<FeedTabsProps> = ({ activeTab, onTabChange, tabs }) => {
  return (
    <div className="overflow-x-auto hide-scrollbar border-b border-gray-200 dark:border-gray-800">
      <div className="flex space-x-1 px-4 min-w-max">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2
              ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};
