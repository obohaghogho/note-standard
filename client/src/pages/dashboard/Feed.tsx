import React, { useState } from 'react';
import { FeedLayout } from '../../components/community/FeedLayout';
import { FeedHeader } from '../../components/community/FeedHeader';
import { FeedTabs } from '../../components/community/FeedTabs';
import { FeedFilters } from '../../components/community/FeedFilters';
import { FeedSearch } from '../../components/community/FeedSearch';
import { FeedContent } from '../../components/community/FeedContent';
import { FeedSidebar } from '../../components/community/FeedSidebar';
import { FeedFAB } from '../../components/community/FeedFAB';

const FEED_TABS = [
  { id: 'following', label: 'Following' },
  { id: 'trending', label: 'Trending' },
  { id: 'latest', label: 'Latest' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'saved', label: 'Saved' },
  { id: 'my-posts', label: 'My Posts' }
];

export const Feed: React.FC = () => {
  const [activeTab, setActiveTab] = useState('trending');
  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<any[]>([]); // Mock posts

  // Simulate loading data
  React.useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      // Mock data representing the Universal Post structure
      setPosts([
        {
          id: '1',
          title: 'The Future of AI in Productivity',
          content: 'Here is how AI is transforming the way we work and think...',
          post_type: 'text',
          category: 'Technology',
          tags: ['AI', 'Productivity', 'Future'],
          saves_count: 124,
          shares_count: 45,
          created_at: new Date().toISOString(),
          profiles: {
            username: 'Alex_Dev',
            avatar_url: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
            is_verified: true
          }
        },
        {
          id: '2',
          title: 'Beautiful UI Designs 2026',
          post_type: 'image',
          category: 'Design',
          tags: ['UI', 'UX', 'Design'],
          media_urls: ['https://images.unsplash.com/photo-1618761714954-0b8cd0026356?auto=format&fit=crop&q=80&w=1000'],
          saves_count: 56,
          shares_count: 12,
          created_at: new Date().toISOString(),
          profiles: {
            username: 'DesignGuru',
            avatar_url: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
            is_verified: false
          }
        }
      ]);
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [activeTab]);

  return (
    <FeedLayout
      sidebar={
        <div className="py-4 h-full flex flex-col">
          <div className="px-4 mb-4">
             <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">NoteStandard</h2>
             <p className="text-xs text-gray-500">Knowledge Ecosystem</p>
          </div>
          <FeedSearch />
          {/* We can add left sidebar navigation here later */}
        </div>
      }
      content={
        <>
          <FeedHeader />
          <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} tabs={FEED_TABS} />
          <FeedFilters />
          <FeedContent posts={posts} isLoading={isLoading} />
        </>
      }
      rightSidebar={<FeedSidebar />}
      fab={<FeedFAB />}
    />
  );
};

export default Feed;
