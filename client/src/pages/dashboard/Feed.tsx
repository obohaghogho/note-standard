import { useEffect, useState } from 'react';
import { Input } from '../../components/common/Input';
import { FeedNoteCard } from '../../components/dashboard/FeedNoteCard';
import { CommentModal } from '../../components/dashboard/CommentModal';
import { Search, Loader2 } from 'lucide-react';
import { supabase, safeCall } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';

export const Feed = () => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

    const fetchFeed = async () => {
        if (!user) return;
        setLoading(true);
        
        const result = await safeCall(
            `feed-${user.id}-${searchTerm}`,
            async () => {
                // Fetch public notes
                const query = supabase
                    .from('notes')
                    .select(`
                        *,
                        owner:profiles!owner_id (username, email, avatar_url)
                    `)
                    .eq('is_private', false)
                    .order('created_at', { ascending: false });

                if (searchTerm) {
                    query.ilike('title', `%${searchTerm}%`);
                }

                const { data: notesData, error } = await query;
                if (error) throw error;

                if (notesData) {
                    // Fetch likes and comments counts for each note
                    const enhancedNotes = await Promise.all(notesData.map(async (note) => {
                        const [likesCount, commentsCount, userLike] = await Promise.all([
                            supabase.rpc('get_like_count', { p_note_id: note.id }),
                            supabase.rpc('get_comment_count', { p_note_id: note.id }),
                            supabase.from('likes').select('id').eq('note_id', note.id).eq('user_id', user.id).maybeSingle()
                        ]);

                        return {
                            ...note,
                            likes_count: likesCount.data || 0,
                            comments_count: commentsCount.data || 0,
                            user_has_liked: !!userLike.data
                        };
                    }));

                    return enhancedNotes;
                }
                return [];
            },
            { minDelay: 1000, fallback: [] }
        );

        setNotes(result || []);
        setLoading(false);
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchFeed();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [user, searchTerm]);

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold">Community Feed</h1>
                    <p className="text-gray-400">Discover public notes from other users</p>
                </div>
                <div className="w-full md:w-72">
                    <Input
                        icon={Search}
                        placeholder="Search public notes..."
                        className="bg-[#121212]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-primary" size={32} />
                </div>
            ) : notes.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                    <div className="text-gray-500">No public notes found yet.</div>
                    <div className="text-sm text-gray-600">Be the first to share a note publicly!</div>
                </div>
            ) : (
                <div className="space-y-4">
                    {notes.map((note) => (
                        <FeedNoteCard
                            key={note.id}
                            note={note}
                            onCommentClick={setActiveNoteId}
                        />
                    ))}
                </div>
            )}

            <CommentModal
                isOpen={!!activeNoteId}
                onClose={() => setActiveNoteId(null)}
                noteId={activeNoteId}
            />
        </div>
    );
};
