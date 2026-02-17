import { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Input } from '../../components/common/Input';
import { Search as SearchIcon, User, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SecureImage from '../../components/common/SecureImage';

interface UserResult {
    id: string;
    username: string;
    email: string;
    avatar_url?: string;
    full_name?: string;
}

interface NoteResult {
    id: string;
    title: string;
    content: string;
    created_at: string;
    owner: {
        username: string;
        avatar_url?: string;
    };
}

type TabType = 'all' | 'users' | 'notes';

export const Search = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    // New: Read URL params
    const [searchParams] = useSearchParams();
    const initialQuery = searchParams.get('q') || '';
    
    const [searchTerm, setSearchTerm] = useState(initialQuery);
    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [users, setUsers] = useState<UserResult[]>([]);
    const [notes, setNotes] = useState<NoteResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Initial search from URL
    useEffect(() => {
        if (initialQuery) {
            handleSearch(initialQuery);
        }
    }, []); // Run once on mount

    // Realtime search effect
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchTerm.trim()) {
                handleSearch();
            } else {
                // Clear results if search is empty
                setUsers([]);
                setNotes([]);
                setHasSearched(false);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchTerm, activeTab]);

    const handleSearch = async (explicitQuery?: string) => {
        const queryToUse = explicitQuery || searchTerm;
        if (!queryToUse.trim()) return;

        setLoading(true);
        setHasSearched(true);

        try {
            // Search users
            const { data: usersData, error: usersError } = await supabase
                .from('profiles')
                .select('id, username, email, avatar_url, full_name')
                .or(`username.ilike.%${queryToUse}%,email.ilike.%${queryToUse}%,full_name.ilike.%${queryToUse}%`)
                .limit(20);

            if (usersError) throw usersError;
            setUsers(usersData || []);

            // Search notes (Public OR My Private Notes)
            // Logic: (is_private = false OR (is_private = true AND owner_id = me))
            // Supabase syntax: .or(is_private.eq.false,and(is_private.eq.true,owner_id.eq.me))
            // Simplified: is_private.eq.false, owner_id.eq.me  -- checking simply if I can see it.
            // But strict query:
            
            let notesQuery = supabase
                .from('notes')
                .select(`
                    id, title, content, created_at,
                    owner:profiles!owner_id (username, avatar_url)
                `)
                .or(`title.ilike.%${queryToUse}%,content.ilike.%${queryToUse}%`)
                .order('created_at', { ascending: false })
                .limit(20);

            if (user) {
                // Allow public notes OR own notes
                notesQuery = notesQuery.or(`is_private.eq.false,owner_id.eq.${user.id}`);
            } else {
                notesQuery = notesQuery.eq('is_private', false);
            }

            const { data: notesData, error: notesError } = await notesQuery;

            if (notesError) throw notesError;
            setNotes(notesData as any || []);

        } catch (error) {
            console.error('Search error:', error);
            // toast.error('Search failed'); // Optional: suppress toast on typing
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = activeTab === 'notes' ? [] : users;
    const filteredNotes = activeTab === 'users' ? [] : notes;

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold">Search</h1>
                <p className="text-gray-400">Find users and public notes</p>
            </div>

            {/* Search Input */}
            <Card variant="glass" className="p-4">
                <div className="flex gap-3">
                    <div className="flex-1">
                        <Input
                            id="global-search"
                            name="search"
                            icon={SearchIcon}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search for users or notes..."
                            className="bg-white/5"
                            aria-label="Search for users or public notes"
                        />
                    </div>
                    {loading && (
                        <div className="flex items-center px-3">
                            <Loader2 size={18} className="animate-spin text-primary" />
                        </div>
                    )}
                </div>
            </Card>

            {/* Tabs */}
            {hasSearched && (
                <div className="flex gap-2 border-b border-white/10 pb-2">
                    {(['all', 'users', 'notes'] as TabType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === tab
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {tab === 'all' && `All (${users.length + notes.length})`}
                            {tab === 'users' && `Users (${users.length})`}
                            {tab === 'notes' && `Notes (${notes.length})`}
                        </button>
                    ))}
                </div>
            )}

            {/* Results */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-primary" size={32} />
                </div>
            ) : hasSearched ? (
                <div className="space-y-6">
                    {/* Users Section */}
                    {filteredUsers.length > 0 && (
                        <div>
                            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <User size={18} className="text-primary" />
                                Users
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {filteredUsers.map((u) => (
                                    <Card
                                        key={u.id}
                                        hoverEffect
                                        className="p-4 flex items-center gap-3 cursor-pointer"
                                    >
                                        {u.avatar_url ? (
                                            <SecureImage
                                                src={u.avatar_url}
                                                alt={u.username}
                                                className="w-12 h-12 rounded-full object-cover"
                                                fallbackType="profile"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                                                {getInitials(u.full_name || u.username || u.email)}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-white truncate">
                                                {u.full_name || u.username}
                                            </div>
                                            <div className="text-sm text-gray-400 truncate">
                                                @{u.username}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes Section */}
                    {filteredNotes.length > 0 && (
                        <div>
                            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <FileText size={18} className="text-primary" />
                                Public Notes
                            </h2>
                            <div className="space-y-3">
                                {filteredNotes.map((note) => (
                                    <Card
                                        key={note.id}
                                        hoverEffect
                                        className="p-4 cursor-pointer"
                                        onClick={() => navigate('/dashboard/feed')}
                                    >
                                        <div className="flex items-start gap-3">
                                            {note.owner?.avatar_url ? (
                                                <SecureImage
                                                    src={note.owner.avatar_url}
                                                    alt={note.owner.username}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                    fallbackType="profile"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                                                    {getInitials(note.owner?.username || 'U')}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm text-gray-400">
                                                        @{note.owner?.username || 'Unknown'}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(note.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h3 className="font-semibold text-white mb-1">
                                                    {note.title || 'Untitled'}
                                                </h3>
                                                <p className="text-sm text-gray-400 line-clamp-2">
                                                    {note.content || 'No content...'}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No Results */}
                    {filteredUsers.length === 0 && filteredNotes.length === 0 && (
                        <div className="text-center py-20">
                            <div className="text-gray-500 mb-2">No results found for "{searchTerm}"</div>
                            <div className="text-sm text-gray-600">Try a different search term</div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-20">
                    <SearchIcon size={48} className="mx-auto text-gray-600 mb-4" />
                    <div className="text-gray-500">Enter a search term to find users and public notes</div>
                </div>
            )}
        </div>
    );
};
