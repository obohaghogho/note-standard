import { useEffect, useState, useCallback, useRef } from 'react';
import { Input } from '../../components/common/Input';
import { CommentModal } from '../../components/dashboard/CommentModal';
import { FeedSkeleton } from '../../components/dashboard/FeedSkeleton';
import { Search, Flame, Clock, TrendingUp, X, ChevronDown, ArrowUp } from 'lucide-react';
import { supabase, safeCall } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';
import { FeedNoteCard } from '../../components/dashboard/FeedNoteCard';
import type { FeedNoteData } from '../../components/dashboard/FeedNoteCard';
import { toast } from 'react-hot-toast';

type SortOption = 'newest' | 'most_liked' | 'most_discussed' | 'trending';

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
    { value: 'newest',        label: 'Newest',        icon: <Clock size={14} /> },
    { value: 'most_liked',    label: 'Most Liked',    icon: <Flame size={14} /> },
    { value: 'most_discussed',label: 'Most Discussed', icon: <TrendingUp size={14} /> },
    { value: 'trending',      label: 'Trending',      icon: <ArrowUp size={14} /> },
];

export const Feed = () => {
    const { user } = useAuth();
    const [notes, setNotes]             = useState<FeedNoteData[]>([]);
    const [loading, setLoading]         = useState(true);
    const [searchTerm, setSearchTerm]   = useState('');
    const [activeTag, setActiveTag]     = useState<string | null>(null);
    const [sort, setSort]               = useState<SortOption>('newest');
    const [sortOpen, setSortOpen]       = useState(false);
    const [hasFetched, setHasFetched]   = useState(false);
    const [activeNote, setActiveNote]   = useState<FeedNoteData | null>(null);
    const [newCount, setNewCount]       = useState(0);
    const [allTags, setAllTags]         = useState<string[]>([]);

    const fetchFeedRef = useRef<() => void>(() => {});
    const isInitialLoad = useRef(true);

    // ─── Collect all unique tags across the feed ──────────────────────────────
    const extractTags = (feedNotes: FeedNoteData[]) => {
        const tagSet = new Set<string>();
        feedNotes.forEach(n => n.tags?.forEach(t => tagSet.add(t)));
        setAllTags(Array.from(tagSet).slice(0, 20));
    };

    // ─── Sort helper ─────────────────────────────────────────────────────────
    const applySortAndFilter = useCallback((raw: FeedNoteData[], s: SortOption, tag: string | null): FeedNoteData[] => {
        let filtered = tag ? raw.filter(n => n.tags?.includes(tag)) : raw;

        switch (s) {
            case 'most_liked':
                return [...filtered].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
            case 'most_discussed':
                return [...filtered].sort((a, b) => (b.comments_count || 0) - (a.comments_count || 0));
            case 'trending': {
                // Score = likes*2 + comments — recency bonus for notes < 48h old
                const now = Date.now();
                return [...filtered].sort((a, b) => {
                    const scoreA = (a.likes_count || 0) * 2 + (a.comments_count || 0)
                        + (now - new Date(a.created_at).getTime() < 172800000 ? 50 : 0);
                    const scoreB = (b.likes_count || 0) * 2 + (b.comments_count || 0)
                        + (now - new Date(b.created_at).getTime() < 172800000 ? 50 : 0);
                    return scoreB - scoreA;
                });
            }
            default: // newest
                return [...filtered].sort((a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
        }
    }, []);

    // ─── Raw data store (pre-sort) ────────────────────────────────────────────
    const rawNotesRef = useRef<FeedNoteData[]>([]);

    const fetchFeed = useCallback(async (silent = false) => {
        if (!user) return;
        if (!silent) setLoading(true);

        const result = await safeCall(
            `feed-${user.id}-${searchTerm}`,
            async () => {
                const query = supabase
                    .from('notes')
                    .select(`
                        *,
                        owner:profiles!owner_id (username, email, avatar_url, plan_tier, is_verified)
                    `)
                    .eq('is_private', false)
                    .order('created_at', { ascending: false });

                if (searchTerm) query.ilike('title', `%${searchTerm}%`);

                const { data: notesData, error } = await query;
                if (error) throw error;

                if (notesData) {
                    const enhanced = await Promise.all(notesData.map(async (note) => {
                        const [likesCount, commentsCount, userLike] = await Promise.all([
                            supabase.rpc('get_like_count', { p_note_id: note.id }),
                            supabase.rpc('get_comment_count', { p_note_id: note.id }),
                            supabase.from('likes').select('id').eq('note_id', note.id).eq('user_id', user.id).maybeSingle()
                        ]);
                        return {
                            ...note,
                            likes_count:    likesCount.data || 0,
                            comments_count: commentsCount.data || 0,
                            user_has_liked: !!userLike.data
                        };
                    }));
                    return enhanced;
                }
                return [];
            },
            { minDelay: 1000, fallback: [] }
        );

        const fresh = result || [];

        if (silent && !isInitialLoad.current) {
            // Count genuinely new items (not in current raw list)
            const currentIds = new Set(rawNotesRef.current.map(n => n.id));
            const brandNew = fresh.filter(n => !currentIds.has(n.id)).length;
            if (brandNew > 0) {
                setNewCount(prev => prev + brandNew);
            }
        } else {
            rawNotesRef.current = fresh;
            extractTags(fresh);
            setNotes(applySortAndFilter(fresh, sort, activeTag));
            setLoading(false);
            isInitialLoad.current = false;
        }

        if (!silent) setLoading(false);
    }, [user, searchTerm, sort, activeTag, applySortAndFilter]);

    // Keep ref current
    useEffect(() => { fetchFeedRef.current = fetchFeed; }, [fetchFeed]);

    // Initial fetch
    useEffect(() => {
        if (!user || hasFetched || searchTerm) return;
        fetchFeed();
        setHasFetched(true);
    }, [user, hasFetched, searchTerm, fetchFeed]);

    // Debounced search
    useEffect(() => {
        if (!searchTerm) return;
        const id = setTimeout(() => fetchFeed(), 500);
        return () => clearTimeout(id);
    }, [fetchFeed, searchTerm]);

    // Re-apply sort / tag filter from cached data without refetch
    useEffect(() => {
        if (rawNotesRef.current.length > 0) {
            setNotes(applySortAndFilter(rawNotesRef.current, sort, activeTag));
        }
    }, [sort, activeTag, applySortAndFilter]);

    // Realtime listeners — silent background refresh
    useEffect(() => {
        if (!user) return;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedRefetch = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchFeedRef.current(), 1500);
        };

        const commentChannel = supabase
            .channel('public-comments')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, debouncedRefetch)
            .subscribe();

        const likeChannel = supabase
            .channel('public-likes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, debouncedRefetch)
            .subscribe();

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(commentChannel);
            supabase.removeChannel(likeChannel);
        };
    }, [user]);

    const currentSort = SORT_OPTIONS.find(s => s.value === sort)!;

    const handleShowNew = () => {
        rawNotesRef.current = [];
        setHasFetched(false);
        setNewCount(0);
        fetchFeed();
        toast.success('Feed refreshed!');
    };

    return (
        <div className="space-y-5 max-w-4xl mx-auto">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold">Community Feed</h1>
                    <p className="text-gray-400 text-sm">Discover public notes from the NoteStandard community</p>
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

            {/* ── Controls: Sort + Tag chips ── */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Sort dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setSortOpen(o => !o)}
                        className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-gray-300"
                    >
                        {currentSort.icon}
                        {currentSort.label}
                        <ChevronDown size={14} className={`transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {sortOpen && (
                        <div className="absolute top-full mt-1 left-0 z-20 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden w-44">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setSort(opt.value); setSortOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors
                                        ${sort === opt.value ? 'bg-primary/10 text-primary' : 'text-gray-300 hover:bg-white/5'}`}
                                >
                                    {opt.icon}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Tag chips */}
                {allTags.length > 0 && (
                    <div className="flex gap-2 flex-wrap items-center">
                        {activeTag && (
                            <button
                                onClick={() => setActiveTag(null)}
                                className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                            >
                                <X size={10} /> Clear
                            </button>
                        )}
                        {allTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => setActiveTag(t => t === tag ? null : tag)}
                                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all
                                    ${activeTag === tag
                                        ? 'bg-primary/20 border-primary/50 text-primary font-semibold'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── New posts banner ── */}
            {newCount > 0 && (
                <button
                    onClick={handleShowNew}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-all animate-pulse"
                >
                    <ArrowUp size={14} />
                    {newCount} new {newCount === 1 ? 'post' : 'posts'} — tap to refresh
                </button>
            )}

            {/* ── Feed content ── */}
            {loading ? (
                <FeedSkeleton />
            ) : notes.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                    <div className="text-5xl mb-4">📝</div>
                    <div className="text-gray-400 font-medium">
                        {activeTag ? `No public notes tagged #${activeTag}` : 'No public notes found yet.'}
                    </div>
                    <div className="text-sm text-gray-600">
                        {activeTag
                            ? <button onClick={() => setActiveTag(null)} className="text-primary hover:underline">Clear tag filter</button>
                            : 'Be the first to share a note publicly!'
                        }
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {notes.map((note) => (
                        <FeedNoteCard
                            key={note.id}
                            note={note}
                            onCommentClick={setActiveNote}
                            onTagClick={setActiveTag}
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
