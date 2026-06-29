import React, { useState } from 'react';
import { Plus, Edit3, Image, BarChart2, Link as LinkIcon } from 'lucide-react';
import { PostComposer } from './PostComposer';
import { CommunityPost } from '../../services/communityService';

interface Props {
  onPosted: (post: CommunityPost) => void;
}

export const FeedFAB: React.FC<Props> = ({ onPosted }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [composerType, setComposerType] = useState<string | null>(null);

  const actions = [
    { label: 'Share Link', icon: <LinkIcon size={18} />, type: 'link' },
    { label: 'Add Media', icon: <Image size={18} />, type: 'image' },
    { label: 'Create Poll', icon: <BarChart2 size={18} />, type: 'poll' },
    { label: 'Write Post', icon: <Edit3 size={18} />, type: 'text' },
  ];

  const open = (type: string) => {
    setComposerType(type);
    setIsOpen(false);
  };

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        {/* Speed dial options */}
        <div className={`absolute bottom-full right-0 mb-4 flex flex-col items-end space-y-3 transition-all duration-200 ${isOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-2 invisible'}`}>
          {actions.map(action => (
            <button
              key={action.type}
              id={`fab-${action.type}`}
              onClick={() => open(action.type)}
              className="flex items-center group"
              aria-label={action.label}
            >
              <span className="mr-3 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {action.label}
              </span>
              <div className="p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-700 transition-all">
                {action.icon}
              </div>
            </button>
          ))}
        </div>

        {/* Main button */}
        <button
          id="community-fab"
          onClick={() => open('text')}
          aria-label="Create new post"
          className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl shadow-blue-500/30 transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <Plus size={24} className={`transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} />
        </button>
      </div>

      {/* Composer modal */}
      {composerType && (
        <PostComposer
          onClose={() => setComposerType(null)}
          onPosted={(post) => {
            onPosted(post);
            setComposerType(null);
          }}
        />
      )}
    </>
  );
};
