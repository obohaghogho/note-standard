import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SpaceHero } from '../../components/community/spaces/SpaceHero';
import { SpaceTabs } from '../../components/community/spaces/SpaceTabs';
import { SpaceHomeDashboard } from '../../components/community/spaces/SpaceHomeDashboard';
import { SpaceKnowledgeLibrary } from '../../components/community/spaces/SpaceKnowledgeLibrary';
import { SpaceAIAssistant } from '../../components/community/spaces/SpaceAIAssistant';
import { SpaceWiki } from '../../components/community/spaces/SpaceWiki';
import { SpaceModeratorDash } from '../../components/community/spaces/SpaceModeratorDash';
import { FeedContent } from '../../components/community/FeedContent';

export default function SpacePage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  
  const [space, setSpace] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [isLoading, setIsLoading] = useState(true);
  
  // Dummy fetch for now. In reality, use React Query or Zustand to fetch Space + Manifest
  useEffect(() => {
    // Simulate fetching space + manifest
    setTimeout(() => {
      setSpace({
        id: spaceId,
        name: 'React Developers',
        description: 'The premier community for advanced React and Next.js development.',
        avatar_url: 'https://via.placeholder.com/150',
        banner_url: 'https://via.placeholder.com/800x200',
        category: 'Technology',
        tags: ['React', 'JavaScript', 'Frontend'],
        member_count: 12450,
        online_count: 342,
        health_score: 94,
        quality_score: 97,
        mod_score: 88,
        response_score: 95,
        safety_score: 99,
        manifest: {
          features: {
            wiki: true,
            ai: true,
            collections: true,
            events: false,
            voice: false
          }
        },
        userRole: 'member' // owner, admin, mod, member
      });
      setIsLoading(false);
    }, 500);
  }, [spaceId]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><span className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></span></div>;
  }

  if (!space) {
    return <div className="p-8 text-center text-muted">Space not found</div>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <SpaceHomeDashboard space={space} onNavigateTab={setActiveTab} />;
      case 'discussions':
        return (
          <div className="max-w-3xl mx-auto py-6">
            <FeedContent posts={[]} /> {/* Reuses Phase 1 Universal Rendering Engine */}
          </div>
        );
      case 'knowledge':
        return <SpaceKnowledgeLibrary spaceId={space.id} />;
      case 'wiki':
        return <SpaceWiki spaceId={space.id} />;
      case 'ai':
        return <SpaceAIAssistant space={space} />;
      case 'moderator':
        return <SpaceModeratorDash spaceId={space.id} />;
      default:
        return <div className="py-12 text-center text-muted">Module not available</div>;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-y-auto">
      <SpaceHero space={space} />
      
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border shadow-sm">
        <SpaceTabs 
          activeTab={activeTab} 
          onSelectTab={setActiveTab} 
          manifest={space.manifest} 
          userRole={space.userRole} 
        />
      </div>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderContent()}
      </main>
    </div>
  );
}
