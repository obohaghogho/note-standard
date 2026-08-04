import React from 'react';
import { FileText, Image as ImageIcon, Users, BookMarked, PenTool } from 'lucide-react';
import { Button } from '../common/Button';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  type: 'posts' | 'notes' | 'media' | 'followers' | 'bookmarks' | 'likes';
  isOwner: boolean;
  onAction?: () => void;
}

export const ProfileEmptyStates: React.FC<EmptyStateProps> = ({ type, isOwner, onAction }) => {
  const content = {
    posts: {
      icon: <PenTool size={40} className="text-gray-500" />,
      title: 'No Posts Yet',
      desc: isOwner ? 'Start writing your first post.' : 'This user hasn\'t posted anything yet.',
      cta: 'Create Post'
    },
    notes: {
      icon: <FileText size={40} className="text-gray-500" />,
      title: 'No Notes Yet',
      desc: isOwner ? 'Start writing your first note.' : 'This user hasn\'t published any notes.',
      cta: 'Create Note'
    },
    media: {
      icon: <ImageIcon size={40} className="text-gray-500" />,
      title: 'No Media',
      desc: isOwner ? 'Upload images or videos to your posts.' : 'No media to show right now.',
      cta: 'Upload Media'
    },
    followers: {
      icon: <Users size={40} className="text-gray-500" />,
      title: 'No Followers',
      desc: isOwner ? 'Engage with others to grow your audience.' : 'Be the first to follow this user!',
      cta: 'Find People'
    },
    bookmarks: {
      icon: <BookMarked size={40} className="text-gray-500" />,
      title: 'No Bookmarks',
      desc: 'You haven\'t bookmarked anything yet. Save interesting posts here.',
      cta: 'Explore Feed'
    },
    likes: {
      icon: <PenTool size={40} className="text-gray-500" />,
      title: 'No Liked Posts',
      desc: isOwner ? 'Posts you like will appear here.' : 'This user hasn\'t liked any posts yet.',
      cta: 'Explore Feed'
    }
  }[type];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 px-4 text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-gray-900 border border-white/5 flex items-center justify-center mb-5 shadow-lg">
        {content.icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{content.title}</h3>
      <p className="text-gray-400 max-w-xs mb-6 text-sm">{content.desc}</p>
      
      {isOwner && onAction && (
        <Button onClick={onAction} variant="outline" className="rounded-full px-6 font-bold">
          {content.cta}
        </Button>
      )}
    </motion.div>
  );
};
