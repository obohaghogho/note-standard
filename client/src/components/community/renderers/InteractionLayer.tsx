import React from 'react';
import { Heart, MessageCircle, Bookmark, Share2 } from 'lucide-react';
import { useFeedStore } from '../../../stores/feedStore';

interface InteractionLayerProps {
  post: any;
  supportedActions: string[];
}

export const InteractionLayer: React.FC<InteractionLayerProps> = ({ post, supportedActions }) => {
  const optimisticLike = useFeedStore((s) => s.optimisticLike);
  const optimisticSave = useFeedStore((s) => s.optimisticSave);

  const handleLike = () => optimisticLike(post.id);
  const handleSave = () => optimisticSave(post.id);

  return (
    <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100 dark:border-gray-800/60">
      <div className="flex items-center space-x-6">
        
        {supportedActions.includes('like') && (
          <button 
            onClick={handleLike}
            className={`flex items-center space-x-2 transition-colors group ${post.user_has_liked ? 'text-red-500' : 'text-gray-500 dark:text-gray-400 hover:text-red-500'}`}
          >
            <div className={`p-1.5 rounded-full transition-colors ${post.user_has_liked ? 'bg-red-50 dark:bg-red-500/20' : 'group-hover:bg-red-50 dark:group-hover:bg-red-500/10'}`}>
              <Heart size={18} fill={post.user_has_liked ? 'currentColor' : 'none'} />
            </div>
            <span className="text-xs font-medium">{post.likes_count || 0}</span>
          </button>
        )}

        {supportedActions.includes('comment') && (
          <button className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors group">
            <div className="p-1.5 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 transition-colors">
              <MessageCircle size={18} />
            </div>
            <span className="text-xs font-medium">{post.comments_count || 0}</span>
          </button>
        )}

        {supportedActions.includes('share') && (
          <button className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors group">
            <div className="p-1.5 rounded-full group-hover:bg-green-50 dark:group-hover:bg-green-500/10 transition-colors">
              <Share2 size={18} />
            </div>
            <span className="text-xs font-medium">{post.shares_count || 0}</span>
          </button>
        )}
      </div>

      {supportedActions.includes('save') && (
        <button 
          onClick={handleSave}
          className={`transition-colors p-1.5 rounded-full ${post.user_has_saved ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-500/20' : 'text-gray-500 dark:text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10'}`}
        >
          <Bookmark size={18} fill={post.user_has_saved ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
};
