import React from 'react';
import { FileText, Image as ImageIcon, Users, BookMarked, PenTool, Heart } from 'lucide-react';
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
      icon: <Heart size={40} className="text-gray-500" />,
      title: 'No liked posts yet.',
      desc: isOwner ? 'Posts you like will appear here.' : 'When this user likes notes, they\'ll appear here.',
      cta: 'Explore Feed'
    }
  }[type];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-24 px-4 text-center"
    >
      <div className="w-20 h-20 rounded-full bg-gray-900 border border-white/5 flex items-center justify-center mb-6 shadow-lg shadow-black/50">
        {content.icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{content.title}</h3>
      <p className="text-gray-400 max-w-xs mb-6 text-sm leading-relaxed">{content.desc}</p>
      
      {isOwner && onAction && (
        <Button onClick={onAction} variant="outline" className="rounded-full px-8 py-2.5 font-bold hover:bg-white hover:text-black transition-colors">
          {content.cta}
        </Button>
      )}
    </motion.div>
  );
};
