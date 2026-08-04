import React from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Eye } from 'lucide-react';
import SecureImage from '../common/SecureImage';
import type { PublicPost } from './PublicProfileModal';
import { formatDistanceToNow } from 'date-fns';

interface ProfilePostCardProps {
  post: PublicPost;
  onLike: () => void;
  onComment: () => void;
  onClick: () => void;
}

export const ProfilePostCard: React.FC<ProfilePostCardProps> = ({ post, onLike, onComment, onClick }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-950 border-b sm:border border-white/5 sm:rounded-2xl overflow-hidden hover:bg-gray-900/50 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
              {post.profiles?.avatar_url ? (
                <SecureImage src={post.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold">
                  {post.profiles?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-white text-sm sm:text-base hover:underline">
                  {post.profiles?.full_name || post.profiles?.username}
                </span>
                {post.profiles?.is_verified && (
                  <span className="text-blue-400 text-xs ml-1" title="Verified">✓</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>@{post.profiles?.username}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
          
          <button className="text-gray-500 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); }}>
            <MoreVertical size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm sm:text-base text-gray-200 mb-4 whitespace-pre-wrap ml-0 sm:ml-13 leading-relaxed">
          {post.content}
        </div>

        {/* Media */}
        {post.media_url && (
          <div className="ml-0 sm:ml-13 mb-4 rounded-xl overflow-hidden border border-white/10 max-h-96 bg-gray-900">
            <SecureImage src={post.media_url} alt="Post media" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Actions */}
        <div className="ml-0 sm:ml-13 flex items-center justify-between text-gray-500 pr-2 sm:pr-8">
          <button 
            onClick={(e) => { e.stopPropagation(); onComment(); }} 
            className="flex items-center gap-2 hover:text-blue-400 group/btn transition-colors"
          >
            <div className="p-2 rounded-full group-hover/btn:bg-blue-400/10 transition-colors">
              <MessageCircle size={18} />
            </div>
            <span className="text-xs font-medium">{post.comments_count > 0 ? post.comments_count : ''}</span>
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); onLike(); }} 
            className={`flex items-center gap-2 group/btn transition-colors ${post.is_liked ? 'text-pink-500' : 'hover:text-pink-500'}`}
          >
            <div className={`p-2 rounded-full group-hover/btn:bg-pink-500/10 transition-colors`}>
              <Heart size={18} className={post.is_liked ? 'fill-current' : ''} />
            </div>
            <span className="text-xs font-medium">{post.likes_count > 0 ? post.likes_count : ''}</span>
          </button>
          
          <button className="flex items-center gap-2 hover:text-emerald-400 group/btn transition-colors" onClick={(e) => e.stopPropagation()}>
            <div className="p-2 rounded-full group-hover/btn:bg-emerald-400/10 transition-colors">
              <Share2 size={18} />
            </div>
          </button>

          <button className="flex items-center gap-2 hover:text-amber-400 group/btn transition-colors" onClick={(e) => e.stopPropagation()}>
            <div className="p-2 rounded-full group-hover/btn:bg-amber-400/10 transition-colors">
              <Bookmark size={18} />
            </div>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
