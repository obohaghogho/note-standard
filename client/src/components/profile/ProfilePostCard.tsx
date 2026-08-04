import React from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, CheckCircle } from 'lucide-react';
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
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="bg-gray-950 border-b border-white/5 hover:bg-gray-900/40 transition-all cursor-pointer group pb-2"
      onClick={onClick}
    >
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-800 shadow-sm">
              {post.profiles?.avatar_url ? (
                <SecureImage src={post.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-lg">
                  {post.profiles?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-[15px] hover:underline transition-colors">
                  {post.profiles?.full_name || post.profiles?.username}
                </span>
                {post.profiles?.is_verified && (
                  <CheckCircle size={14} className="text-blue-400 fill-blue-500/20" title="Verified" />
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-medium">
                <span>@{post.profiles?.username}</span>
                <span>•</span>
                <span className="hover:underline">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
          
          <button className="text-gray-500 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); }}>
            <MoreVertical size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="text-[15px] text-gray-200 mb-4 whitespace-pre-wrap ml-0 sm:ml-13 leading-relaxed">
          {post.content}
        </div>

        {/* Media */}
        {post.media_url && (
          <div className="ml-0 sm:ml-13 mb-4 rounded-2xl overflow-hidden border border-white/10 max-h-[400px] bg-gray-900 shadow-lg">
            <SecureImage src={post.media_url} alt="Post media" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Actions */}
        <div className="ml-0 sm:ml-13 flex items-center justify-between text-gray-500 pr-2 sm:pr-8 mt-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onComment(); }} 
            className="flex items-center gap-2 hover:text-blue-400 group/btn transition-colors"
          >
            <div className="p-2 rounded-full group-hover/btn:bg-blue-400/10 transition-colors">
              <MessageCircle size={18} />
            </div>
            <span className="text-xs font-semibold">{post.comments_count > 0 ? post.comments_count : ''}</span>
          </button>
          
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); onLike(); }} 
            className={`flex items-center gap-2 group/btn transition-colors ${post.is_liked ? 'text-pink-500' : 'hover:text-pink-500'}`}
          >
            <div className={`p-2 rounded-full group-hover/btn:bg-pink-500/10 transition-colors`}>
              <Heart size={18} className={post.is_liked ? 'fill-current' : ''} />
            </div>
            <span className="text-xs font-semibold">{post.likes_count > 0 ? post.likes_count : ''}</span>
          </motion.button>
          
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
