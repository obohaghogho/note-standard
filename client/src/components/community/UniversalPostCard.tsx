import React from 'react';
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal } from 'lucide-react';

interface UniversalPostCardProps {
  post: any; // Type will be defined later
}

export const UniversalPostCard: React.FC<UniversalPostCardProps> = ({ post }) => {
  return (
    <article className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <img src={post.profiles?.avatar_url || 'https://via.placeholder.com/40'} alt="Avatar" className="w-10 h-10 rounded-full object-cover bg-gray-100" />
            <div>
              <div className="flex items-center space-x-1">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white hover:underline cursor-pointer">{post.profiles?.username || 'Unknown User'}</h4>
                {post.profiles?.is_verified && <span className="text-blue-500 text-xs">✓</span>}
                {post.space_id && (
                  <>
                    <span className="text-gray-400 dark:text-gray-500 text-xs mx-1">in</span>
                    <span className="font-bold text-sm text-gray-900 dark:text-white hover:underline cursor-pointer">Space Name</span>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">2h ago • {post.category}</p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <MoreHorizontal size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="mb-4 space-y-3">
          {post.title && <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{post.title}</h2>}
          {post.content && <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-4">{post.content}</p>}
          
          {/* Dynamic Content Area based on post_type */}
          {post.post_type === 'image' && post.media_urls?.[0] && (
            <div className="rounded-xl overflow-hidden mt-3 max-h-96 bg-gray-100 dark:bg-gray-800">
              <img src={post.media_urls[0]} alt="Post media" className="w-full h-full object-cover" loading="lazy" />
            </div>
          )}
          {/* We will implement other types (video, poll, code) later */}
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag: string, index: number) => (
              <span key={index} className="text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">#{tag}</span>
            ))}
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800/60">
          <div className="flex items-center space-x-6">
            <button className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors group">
              <div className="p-1.5 rounded-full group-hover:bg-red-50 dark:group-hover:bg-red-500/10 transition-colors">
                <Heart size={18} />
              </div>
              <span className="text-xs font-medium">{post.saves_count || 0}</span>
            </button>
            <button className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors group">
              <div className="p-1.5 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 transition-colors">
                <MessageCircle size={18} />
              </div>
              <span className="text-xs font-medium">12</span>
            </button>
            <button className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors group">
              <div className="p-1.5 rounded-full group-hover:bg-green-50 dark:group-hover:bg-green-500/10 transition-colors">
                <Share2 size={18} />
              </div>
              <span className="text-xs font-medium">{post.shares_count || 0}</span>
            </button>
          </div>
          <button className="text-gray-500 dark:text-gray-400 hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors p-1.5 rounded-full hover:bg-yellow-50 dark:hover:bg-yellow-500/10">
            <Bookmark size={18} />
          </button>
        </div>
      </div>
    </article>
  );
};
