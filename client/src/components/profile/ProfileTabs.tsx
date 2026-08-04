import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

export type ProfileTab = 'posts' | 'notes' | 'media' | 'likes' | 'bookmarks' | 'about';

interface ProfileTabsProps {
  activeTab: ProfileTab;
  setActiveTab: (tab: ProfileTab) => void;
  isOwner: boolean;
  profileId: string;
}

export const ProfileTabs: React.FC<ProfileTabsProps> = ({ activeTab, setActiveTab, isOwner, profileId }) => {
  const tabs: { id: ProfileTab; label: string; show: boolean }[] = [
    { id: 'posts', label: 'Posts', show: true },
    { id: 'notes', label: 'Notes', show: true },
    { id: 'media', label: 'Media', show: true },
    { id: 'likes', label: 'Likes', show: true },
    { id: 'bookmarks', label: 'Bookmarks', show: isOwner },
    { id: 'about', label: 'About', show: true },
  ];

  const visibleTabs = tabs.filter(t => t.show);

  // Remember last tab
  useEffect(() => {
    const saved = localStorage.getItem(`profile_tab_${profileId}`);
    if (saved && visibleTabs.some(t => t.id === saved)) {
      setActiveTab(saved as ProfileTab);
    }
  }, [profileId]); // Run once when profile changes

  const handleTabClick = (id: ProfileTab) => {
    setActiveTab(id);
    localStorage.setItem(`profile_tab_${profileId}`, id);
  };

  return (
    <div className="flex items-center overflow-x-auto scrollbar-hide border-b border-gray-800 bg-gray-950 px-2 sm:px-6 sticky top-0 z-20">
      <div className="flex gap-1 sm:gap-4 min-w-max">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`relative px-4 py-4 text-sm font-semibold transition-colors ${
                isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              } rounded-t-xl`}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute left-0 right-0 bottom-0 h-1 bg-primary rounded-t-full"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
