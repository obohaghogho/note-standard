import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, CheckCircle, Play } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaUrl = post.media_url || (Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : null);

  const isVideo = Boolean(
    mediaUrl && (
      /\.(mp4|webm|mov|m3u8|ogg)($|\?)/i.test(mediaUrl) ||
      post.post_type === 'reel' ||
      post.post_type === 'video' ||
      post.category === 'reel'
    )
  );

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
        {post.content && (
          <div className="text-[15px] text-gray-200 mb-4 whitespace-pre-wrap ml-0 sm:ml-13 leading-relaxed">
            {post.content}
          </div>
        )}

        {/* Media */}
        {mediaUrl && (
          <div 
            className="ml-0 sm:ml-13 mb-4 rounded-2xl overflow-hidden border border-white/10 max-h-[420px] bg-gray-900 shadow-lg relative group/media"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo ? (
              <div className="relative w-full h-full min-h-[220px] bg-black flex items-center justify-center">
                <video
                  src={mediaUrl}
                  controls={isPlaying}
                  preload="metadata"
                  playsInline
                  className="w-full max-h-[400px] object-contain rounded-2xl"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                {!isPlaying && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const container = e.currentTarget.parentElement;
                      const videoEl = container?.querySelector('video') as HTMLVideoElement;
                      if (videoEl) {
                        videoEl.play();
                        setIsPlaying(true);
                      }
                    }}
                    className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-emerald-500/80 hover:bg-emerald-500 text-neutral-950 flex items-center justify-center shadow-xl backdrop-blur-sm transition-all transform hover:scale-105"
                    title="Play Reel Video"
                  >
                    <Play size={24} className="fill-current ml-1" />
                  </button>
                )}
                <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-xs text-white font-semibold px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1">
                  🎬 Reel
                </span>
              </div>
            ) : (
              <SecureImage src={mediaUrl} alt="Post media" className="w-full h-full object-cover" />
            )}
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

