import { useState } from 'react';
import { Card } from '../../components/common/Card';
import SecureImage from '../../components/common/SecureImage';
import { Heart, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

interface FeedNoteCardProps {
    note: {
        id: string;
        title: string;
        content: string;
        created_at: string;
        tags: string[];
        owner_id: string;
        likes_count?: number;
        comments_count?: number;
        user_has_liked?: boolean;
        owner?: {
            username: string;
            email: string;
            avatar_url?: string;
        };
    };
    onCommentClick: (noteId: string) => void;
}

export const FeedNoteCard = ({ note, onCommentClick }: FeedNoteCardProps) => {
    const { user } = useAuth();
    const [liked, setLiked] = useState(note.user_has_liked || false);
    const [likesCount, setLikesCount] = useState(note.likes_count || 0);
    const [loadingLike, setLoadingLike] = useState(false);

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || loadingLike) return;

        setLoadingLike(true);
        // Optimistic update
        const newLikedState = !liked;
        setLiked(newLikedState);
        setLikesCount(prev => newLikedState ? prev + 1 : prev - 1);

        try {
            if (newLikedState) {
                const { error } = await supabase
                    .from('likes')
                    .insert({ user_id: user.id, note_id: note.id });
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('likes')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('note_id', note.id);
                if (error) throw error;
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            // Revert on error
            setLiked(!newLikedState);
            setLikesCount(prev => !newLikedState ? prev + 1 : prev - 1);
            toast.error('Failed to update like');
        } finally {
            setLoadingLike(false);
        }
    };

    return (
        <Card className="p-0 overflow-hidden group border-white/5 hover:border-white/10 transition-all">
            <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-primary font-bold text-xs overflow-hidden">
                            {note.owner?.avatar_url ? (
                                <SecureImage src={note.owner.avatar_url} alt={note.owner.username} className="w-full h-full object-cover" fallbackType="profile" />
                            ) : (
                                (note.owner?.username?.[0] || note.owner?.email?.[0] || '?').toUpperCase()
                            )}
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white">
                                {note.owner?.username || 'Unknown User'}
                            </div>
                            <div className="text-[10px] text-gray-500">
                                {new Date(note.created_at).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    onClick={() => onCommentClick(note.id)}
                    className="cursor-pointer"
                >
                    <h3 className="font-bold text-xl mb-2 group-hover:text-primary transition-colors">
                        {note.title || 'Untitled'}
                    </h3>
                    <p className="text-gray-400 text-sm line-clamp-3 mb-4 leading-relaxed">
                        {note.content || 'No content...'}
                    </p>

                    <div className="flex gap-2 mb-4 flex-wrap">
                        {note.tags && note.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] px-2 py-0.5 bg-white/5 text-gray-400 rounded-full border border-white/5">
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                    <button
                        onClick={handleLike}
                        className={`flex items-center gap-1.5 text-sm transition-colors ${liked ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                    >
                        <Heart size={18} fill={liked ? "currentColor" : "none"} />
                        <span>{likesCount}</span>
                    </button>

                    <button
                        onClick={() => onCommentClick(note.id)}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors"
                    >
                        <MessageCircle size={18} />
                        <span>{note.comments_count || 0}</span>
                    </button>
                </div>
            </div>
        </Card>
    );
};
