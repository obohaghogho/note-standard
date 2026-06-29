import { useState } from 'react';
import { Card } from '../../components/common/Card';
import SecureImage from '../../components/common/SecureImage';
import { Heart, MessageCircle, Share2, Bookmark, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { UserBadge } from '../../components/common/UserBadge';
import { API_URL, getAuthHeader } from '../../lib/api';

export interface FeedNoteData {
    id: string;
    title: string;
    content: string;
    created_at: string;
    tags: string[];
    owner_id: string;
    is_private: boolean;
    likes_count: number;
    comments_count: number;
    user_has_liked: boolean;
    owner?: {
        username?: string;
        email?: string;
        avatar_url?: string;
        plan_tier?: string;
        is_verified?: boolean;
    };
}

interface FeedNoteCardProps {
    note: FeedNoteData;
    onCommentClick: (note: FeedNoteData) => void;
    onTagClick?: (tag: string) => void;
}

function getReadTime(content: string): string {
    const words = content?.trim().split(/\s+/).length || 0;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
}

export const FeedNoteCard = ({ note, onCommentClick, onTagClick }: FeedNoteCardProps) => {
    const { user, session } = useAuth();
    const [liked, setLiked] = useState(note.user_has_liked || false);
    const [likesCount, setLikesCount] = useState(note.likes_count || 0);
    const [loadingLike, setLoadingLike] = useState(false);
    const [heartBurst, setHeartBurst] = useState(false);

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || !session || loadingLike) return;

        setLoadingLike(true);
        const previousLiked = liked;
        const previousCount = likesCount;

        const newLikedState = !liked;
        setLiked(newLikedState);
        setLikesCount(prev => newLikedState ? prev + 1 : prev - 1);

        // Trigger heart burst animation on like
        if (newLikedState) {
            setHeartBurst(true);
            setTimeout(() => setHeartBurst(false), 600);
        }

        try {
            const res = await fetch(`${API_URL}/api/community/like`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await getAuthHeader())
                },
                body: JSON.stringify({ noteId: note.id })
            });

            if (!res.ok) throw new Error('Failed to toggle like');
            const data = await res.json();
            setLiked(data.liked);
        } catch {
            setLiked(previousLiked);
            setLikesCount(previousCount);
            toast.error('Failed to update like');
        } finally {
            setLoadingLike(false);
        }
    };

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const url = `${window.location.origin}/dashboard/feed?note=${note.id}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied to clipboard!');
        } catch {
            toast.error('Could not copy link');
        }
    };

    const handleBookmark = (e: React.MouseEvent) => {
        e.stopPropagation();
        toast.success('Saved to your notes!', { icon: '🔖' });
    };

    return (
        <Card className="p-0 overflow-hidden group border-white/5 hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <div className="p-5">
                {/* Author Row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-primary font-bold text-xs overflow-hidden ring-2 ring-white/5">
                            {note.owner?.avatar_url ? (
                                <SecureImage src={note.owner.avatar_url} alt={note.owner.username} className="w-full h-full object-cover" fallbackType="profile" />
                            ) : (
                                (note.owner?.username?.[0] || note.owner?.email?.[0] || '?').toUpperCase()
                            )}
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white flex items-center gap-1">
                                {note.owner?.username || 'Unknown User'}
                                <UserBadge
                                    planTier={note.owner?.plan_tier?.toLowerCase() as 'free' | 'pro' | 'team' | 'business' | 'enterprise'}
                                    isVerified={note.owner?.is_verified}
                                />
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <span>{new Date(note.created_at).toLocaleDateString()}</span>
                                <span>·</span>
                                <span className="flex items-center gap-0.5">
                                    <Clock size={10} />
                                    {getReadTime(note.content)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick actions top-right */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={handleBookmark}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-all"
                            title="Save note"
                        >
                            <Bookmark size={15} />
                        </button>
                        <button
                            onClick={handleShare}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                            title="Copy link"
                        >
                            <Share2 size={15} />
                        </button>
                    </div>
                </div>

                {/* Note Content */}
                <div onClick={() => onCommentClick(note)} className="cursor-pointer">
                    <h3 className="font-bold text-xl mb-2 group-hover:text-primary transition-colors leading-tight">
                        {note.title || 'Untitled'}
                    </h3>
                    <p className="text-gray-400 text-sm line-clamp-4 mb-4 leading-relaxed group-hover:text-gray-300 transition-colors">
                        {note.content || 'No content...'}
                    </p>
                    {note.content?.length > 300 && (
                        <div className="text-primary text-xs font-semibold mb-4 flex items-center gap-1">
                            Read more →
                        </div>
                    )}

                    {/* Tags */}
                    {note.tags && note.tags.length > 0 && (
                        <div className="flex gap-2 mb-4 flex-wrap">
                            {note.tags.slice(0, 4).map(tag => (
                                <button
                                    key={tag}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTagClick?.(tag);
                                    }}
                                    className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary/80 rounded-full border border-primary/20 hover:bg-primary/20 hover:text-primary transition-all"
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                    {/* Like with burst animation */}
                    <button
                        onClick={handleLike}
                        className={`relative flex items-center gap-1.5 text-sm transition-all duration-200 select-none
                            ${liked ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}
                            ${heartBurst ? 'scale-125' : 'scale-100'}
                        `}
                    >
                        <span className={`transition-transform duration-200 ${heartBurst ? 'scale-150' : 'scale-100'}`}>
                            <Heart
                                size={18}
                                fill={liked ? 'currentColor' : 'none'}
                                className={heartBurst ? 'drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]' : ''}
                            />
                        </span>
                        <span className="font-medium">{likesCount}</span>
                    </button>

                    <button
                        onClick={() => onCommentClick(note)}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors"
                    >
                        <MessageCircle size={18} />
                        <span className="font-medium">{note.comments_count || 0}</span>
                    </button>

                    <div className="ml-auto">
                        <button
                            onClick={handleShare}
                            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors"
                        >
                            <Share2 size={14} />
                            Share
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
};
