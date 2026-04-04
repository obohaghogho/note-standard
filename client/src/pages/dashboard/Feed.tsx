import { useEffect, useState, useCallback, useRef } from 'react';
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
    const [hasFetched, setHasFetched] = useState(false);
    const [activeNote, setActiveNote] = useState<any | null>(null);
    const fetchFeedRef = useRef<() => void>(() => {});

    const fetchFeed = useCallback(async () => {
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
                        owner:profiles!owner_id (username, email, avatar_url, plan_tier, is_verified)
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
    }, [user, searchTerm]);

    // Update the ref to always point to the latest stable fetch function
    useEffect(() => {
        fetchFeedRef.current = fetchFeed;
    }, [fetchFeed]);

    // Effect 1: Initial Mount Fetcher - 🔥 Production-safe guard
    useEffect(() => {
        if (!user || hasFetched || searchTerm) return;
        
        console.log('[Feed] Production-safe initial fetch');
        fetchFeed();
        setHasFetched(true);
    }, [user, hasFetched, searchTerm, fetchFeed]);

    // Effect 2: Debounced Search Fetcher
    useEffect(() => {
        if (!searchTerm) return; // Managed by initial fetch or realtime
        
        const timeoutId = setTimeout(() => {
            fetchFeed();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [fetchFeed, searchTerm]);

    // Effect 2: Realtime Listeners - 🔥 ONLY RUN ONCE
    useEffect(() => {
        if (!user) return;

        console.log('[Feed] Setting up stable realtime listeners');
        
        // Setup Realtime Subscriptions for counts
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedRefetch = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchFeedRef.current(), 1000);
        };

        const commentChannel = supabase
            .channel('public-comments')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'comments' },
                () => debouncedRefetch()
            )
            .subscribe();

        const likeChannel = supabase
            .channel('public-likes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'likes' },
                () => debouncedRefetch()
            )
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(commentChannel);
            supabase.removeChannel(likeChannel);
        };
    }, [user]); // Only re-runs if the user identity changes

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold">Community Feed</h1>
                    <p className="text-gray-400">Discover public notes from other users</p>
                </div>
                <div className="w-full md:w-72">
                    <Input
                        id="feed-search"
                        name="feedSearch"
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
                            onCommentClick={setActiveNote}
                        />
                    ))}
                </div>
            )}

            <CommentModal
                isOpen={!!activeNote}
                onClose={() => setActiveNote(null)}
                note={activeNote}
            />
        </div>
    );
};

export default Feed;
