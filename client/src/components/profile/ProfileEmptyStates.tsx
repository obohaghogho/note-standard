import React from 'react';
import { FileText, Image as ImageIcon, Users, BookMarked, PenTool } from 'lucide-react';
import { Button } from '../common/Button';

interface EmptyStateProps {
  type: 'posts' | 'notes' | 'media' | 'followers' | 'bookmarks' | 'likes';
  isOwner: boolean;
  onAction?: () => void;
}

export const ProfileEmptyStates: React.FC<EmptyStateProps> = ({ type, isOwner, onAction }) => {
  const content = {
    posts: {
      icon: <PenTool size={48} className="text-gray-600" />,
      title: 'No Posts Yet',
      desc: isOwner ? 'Share your thoughts with the community.' : 'This user hasn\'t posted anything yet.',
      cta: 'Create a Post'
    },
    notes: {
      icon: <FileText size={48} className="text-gray-600" />,
      title: 'No Notes Yet',
      desc: isOwner ? 'Create your first note to get started.' : 'This user hasn\'t published any notes.',
      cta: 'Write a Note'
    },
    media: {
      icon: <ImageIcon size={48} className="text-gray-600" />,
      title: 'No Media Yet',
      desc: isOwner ? 'Upload images or videos to your posts.' : 'No media to show right now.',
      cta: 'Upload Media'
    },
    followers: {
      icon: <Users size={48} className="text-gray-600" />,
      title: 'No Followers Yet',
      desc: isOwner ? 'Engage with others to grow your audience.' : 'Be the first to follow this user!',
      cta: 'Find People'
    },
    bookmarks: {
      icon: <BookMarked size={48} className="text-gray-600" />,
      title: 'No Bookmarks',
      desc: 'You haven\'t bookmarked anything yet. Save interesting posts here.',
      cta: 'Explore Feed'
    },
    likes: {
      icon: <PenTool size={48} className="text-gray-600" />,
      title: 'No Liked Posts',
      desc: isOwner ? 'Posts you like will appear here.' : 'This user hasn\'t liked any posts yet.',
      cta: 'Explore Feed'
    }
  }[type];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="w-24 h-24 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-6 shadow-inner">
        {content.icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{content.title}</h3>
      <p className="text-gray-400 max-w-sm mb-6">{content.desc}</p>
      
      {isOwner && onAction && (
        <Button onClick={onAction} variant="outline" className="rounded-full">
          {content.cta}
        </Button>
      )}
    </div>
  );
};
