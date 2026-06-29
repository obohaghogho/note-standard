import React from 'react';

interface SpaceTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  manifest: any;
  userRole: string;
}

export const SpaceTabs: React.FC<SpaceTabsProps> = ({ activeTab, onSelectTab, manifest, userRole }) => {
  const tabs = [
    { id: 'home', label: 'Home', alwaysVisible: true },
    { id: 'discussions', label: 'Discussions', alwaysVisible: true },
    { id: 'knowledge', label: 'Knowledge Library', alwaysVisible: true },
    { id: 'wiki', label: 'Wiki', featureKey: 'wiki' },
    { id: 'collections', label: 'Collections', featureKey: 'collections' },
    { id: 'members', label: 'Members', alwaysVisible: true },
    { id: 'events', label: 'Events', featureKey: 'events' },
    { id: 'ai', label: 'AI Assistant', featureKey: 'ai' },
    { id: 'about', label: 'About', alwaysVisible: true },
  ];

  const isModerator = ['owner', 'admin', 'moderator'].includes(userRole);

  const visibleTabs = tabs.filter(t => t.alwaysVisible || (manifest?.features && manifest.features[t.featureKey!]));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar py-3">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`whitespace-nowrap pb-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.id 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted hover:text-heading hover:border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
        
        {isModerator && (
          <button
            onClick={() => onSelectTab('moderator')}
            className={`whitespace-nowrap pb-1 border-b-2 font-medium text-sm transition-colors ml-auto ${
              activeTab === 'moderator' 
                ? 'border-danger text-danger' 
                : 'border-transparent text-danger/70 hover:text-danger hover:border-danger/30'
            }`}
          >
            Mod Dashboard
          </button>
        )}
      </div>
    </div>
  );
};
