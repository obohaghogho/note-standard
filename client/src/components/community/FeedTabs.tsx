import React from 'react';



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
    <div className="overflow-x-auto hide-scrollbar border-b border-gray-200/80 dark:border-gray-800/80 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
      <div className="flex space-x-1 px-3 sm:px-4 min-w-max py-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              whitespace-nowrap px-3 py-2 text-xs sm:text-sm font-semibold transition-all border-b-2 cursor-pointer
              ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
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
