import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Input } from '../../components/common/Input';
import { Search, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { ViewNoteModal } from '../../components/dashboard/ViewNoteModal';

interface Note {
    id: string;
    title: string;
    content: string;
    created_at: string;
    tags: string[];
    owner_id: string;
    is_private?: boolean;
    owner?: {
        email: string;
        username: string;
    }
}

export const Shared = () => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewingNote, setViewingNote] = useState<Note | null>(null);

    useEffect(() => {
        const fetchSharedNotes = async () => {
            if (!user) return;
            try {
                // Fetch explicitly shared notes via the shared_notes table
                // This prevents accidentally querying every single public note on the platform
                let query = supabase
                    .from('shared_notes')
                    .select(`
                        note:notes!inner(
                            id,
                            title,
                            content,
                            created_at,
                            updated_at,
                            tags,
                            owner_id,
                            is_private
                        )
                    `)
                    .neq('notes.owner_id', user.id)
                    .order('shared_at', { ascending: false });

                if (searchTerm) {
                    query = query.ilike('notes.title', `%${searchTerm}%`) as any;
                }

                const { data: sharedData, error } = await query;
                if (error) throw error;

                if (sharedData && sharedData.length > 0) {
                    // Extract inner notes and deduplicate (if shared in multiple teams)
                    const rawNotes = sharedData.map((d: any) => d.note).filter(Boolean);
                    const uniqueNotes = Array.from(new Map(rawNotes.map(n => [n.id, n])).values());

                    // Fetch profiles of original owners
                    const ownerIds = [...new Set(uniqueNotes.map(n => n.owner_id))];
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, email, username')
                        .in('id', ownerIds);

                    const profileMap = new Map(profiles?.map(p => [p.id, p]));

                    const notesWithOwners = uniqueNotes.map(note => ({
                        ...note,
                        owner: profileMap.get(note.owner_id)
                    }));

                    setNotes(notesWithOwners as Note[]);
                } else {
                    setNotes([]);
                }

            } catch (error) {
                console.error('Error loading shared notes:', error);
                toast.error('Failed to load shared notes');
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchSharedNotes();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [user, searchTerm]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold">Shared With Me</h1>
                    <p className="text-gray-400">Notes shared with you directly or via teams</p>
                </div>
                <div className="w-full md:w-64">
                    <Input
                        id="shared-notes-search"
                        name="search"
                        icon={Search}
                        placeholder="Search shared notes..."
                        className="bg-[#121212]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-gray-400 text-center py-10">Loading shared notes...</div>
            ) : notes.length === 0 ? (
                <div className="text-gray-400 text-center py-10">
                    {searchTerm ? 'No shared notes found.' : 'No notes have been shared with you yet.'}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {notes?.map((note) => (
                        <Card 
                            key={note.id} 
                            hoverEffect 
                            className="p-5 cursor-pointer flex flex-col h-[200px] group transition-all"
                            onClick={() => setViewingNote(note)}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">
                                    <User size={12} />
                                    <span>{note.owner?.username || note.owner?.email || 'Unknown'}</span>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {new Date(note.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                                {note.title || 'Untitled'}
                            </h3>
                            <p className="text-gray-400 text-sm line-clamp-3 mb-4 flex-1">
                                {note.content || 'No content...'}
                            </p>
                        </Card>
                    ))}
                </div>
            )}

            <ViewNoteModal
                isOpen={!!viewingNote}
                onClose={() => setViewingNote(null)}
                note={viewingNote}
            />
        </div>
    );
};

export default Shared;
