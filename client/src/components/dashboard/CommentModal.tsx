import { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { X, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

interface Comment {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    profile?: {
        username: string;
        email: string;
        avatar_url?: string;
    };
}

interface CommentModalProps {
    isOpen: boolean;
    onClose: () => void;
    noteId: string | null;
}

export const CommentModal = ({ isOpen, onClose, noteId }: CommentModalProps) => {
    const { user } = useAuth();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && noteId) {
            fetchComments();
        } else {
            setComments([]);
            setNewComment('');
        }
    }, [isOpen, noteId]);

    const fetchComments = async () => {
        if (!noteId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('comments')
                .select(`
                    *,
                    profile:profiles!user_id (username, email, avatar_url)
                `)
                .eq('note_id', noteId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setComments(data as any || []);
        } catch (error) {
            console.error('Error fetching comments:', error);
            // toast.error('Failed to load comments');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user || !noteId) return;

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('comments')
                .insert({
                    content: newComment.trim(),
                    note_id: noteId,
                    user_id: user.id
                });

            if (error) throw error;

            setNewComment('');
            fetchComments();
            toast.success('Comment added');
        } catch (error) {
            console.error('Error adding comment:', error);
            toast.error('Failed to add comment');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId);

            if (error) throw error;

            setComments(prev => prev.filter(c => c.id !== commentId));
            toast.success('Comment deleted');
        } catch (error) {
            console.error('Error deleting comment:', error);
            toast.error('Failed to delete comment');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <Card className="w-full max-w-lg relative z-10 flex flex-col max-h-[80vh]" variant="glass">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-bold text-lg">Comments</h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="text-center text-gray-500 py-8">Loading comments...</div>
                    ) : comments.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">No comments yet. Be the first!</div>
                    ) : (
                        comments.map(comment => (
                            <div key={comment.id} className="group flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                                    {(comment.profile?.username?.[0] || comment.profile?.email?.[0] || '?').toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <div className="bg-white/5 rounded-2xl rounded-tl-none p-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-gray-300">
                                                {comment.profile?.username || 'User'}
                                            </span>
                                            <span className="text-[10px] text-gray-500">
                                                {new Date(comment.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-200">{comment.content}</p>
                                    </div>
                                    {(user?.id === comment.user_id) && (
                                        <button
                                            onClick={() => handleDelete(comment.id)}
                                            className="text-xs text-red-400 hover:text-red-300 ml-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 flex gap-2">
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary/50"
                    />
                    <Button type="submit" size="sm" disabled={!newComment.trim() || submitting} loading={submitting}>
                        <Send size={16} />
                    </Button>
                </form>
            </Card>
        </div>
    );
};
