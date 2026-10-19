import React from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import SecureImage from '../common/SecureImage';
import VerifiedBadge from '../common/VerifiedBadge';
import type { PublicPost } from './PublicProfileModal';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { FeedVideoPlayer } from '../community/FeedVideoPlayer';

interface ProfilePostCardProps {
  post: PublicPost & {
    author?: {
      id?: string;
      username?: string;
      full_name?: string;
      avatar_url?: string;
      is_verified?: boolean;
    };
  };
  onLike: () => void;
  onComment: () => void;
  onClick: () => void;
  onShare?: () => void;
}

export const ProfilePostCard: React.FC<ProfilePostCardProps> = ({ post, onLike, onComment, onClick, onShare }) => {

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShare) {
      onShare();
      return;
    }

    const shareUrl = `${window.location.origin}/dashboard/post/${post.id}`;
    const shareData = {
      title: `Post by @${post.profiles?.username || post.author?.username || 'user'} on NoteStandard`,
      text: post.content ? post.content.slice(0, 100) : 'Check out this post on NoteStandard',
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          try {
            await navigator.clipboard.writeText(shareUrl);
            toast.success('Post link copied to clipboard!');
          } catch {
            toast.error('Failed to share post');
          }
        }
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Post link copied to clipboard!');
      } catch {
        toast.error('Failed to copy link to clipboard');
      }
    } else {
      toast.error('Sharing is not supported on this browser');
    }
  };

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
              {post.profiles?.avatar_url || post.author?.avatar_url ? (
                <SecureImage src={post.profiles?.avatar_url || post.author?.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-lg">
                  {(post.profiles?.username || post.author?.username)?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-[15px] hover:underline transition-colors">
                  {post.profiles?.full_name || post.author?.full_name || post.profiles?.username || post.author?.username || 'Unknown'}
                </span>
                {Boolean(post.profiles?.is_verified || post.author?.is_verified) && (
                  <VerifiedBadge size={14} className="shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-medium">
                <span>@{post.profiles?.username || post.author?.username || 'user'}</span>
                <span>•</span>
                <span className="hover:underline">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>

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
            className="ml-0 sm:ml-13 mb-4 rounded-2xl overflow-hidden border border-white/10 max-h-[85vh] bg-transparent shadow-lg relative group/media"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo ? (
              <div className="relative w-full h-full min-h-[220px] bg-transparent flex items-center justify-center">
                <FeedVideoPlayer
                  src={mediaUrl}
                  postId={`profile-${post.id}`}
                  className="w-full h-auto max-h-[85vh] object-cover rounded-2xl block mx-auto bg-transparent"
                />
                <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-xs text-white font-semibold px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1 z-20">
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
            <div className="p-2 rounded-full group-hover/btn:bg-pink-500/10 transition-colors">
              <Heart size={18} className={post.is_liked ? 'fill-current' : ''} />
            </div>
            <span className="text-xs font-semibold">{post.likes_count > 0 ? post.likes_count : ''}</span>
          </motion.button>

          <button
            type="button"
            className="flex items-center gap-2 hover:text-emerald-400 group/btn transition-colors cursor-pointer"
            onClick={handleShare}
            title="Share Post"
            aria-label="Share Post"
          >
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
