import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Input } from '../../components/common/Input';
import { Search, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

interface Note {
    id: string;
    title: string;
    content: string;
    created_at: string;
    tags: string[];
    owner_id: string;
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

    useEffect(() => {
        const fetchSharedNotes = async () => {
            if (!user) return;
            try {
                // Fetch notes where I am NOT the owner
                // RLS will ensure I only see notes shared with me
                // We also want to know WHO shared it, so we need to join with profiles manually or fetch owners
                // Since notes table has owner_id, let's just fetch notes first
                const query = supabase
                    .from('notes')
                    .select('*')
                    .neq('owner_id', user.id)
                    .order('updated_at', { ascending: false });

                if (searchTerm) {
                    query.ilike('title', `%${searchTerm}%`);
                }

                const { data: notesData, error } = await query;
                if (error) throw error;

                // Now fetch owner profiles for these notes
                if (notesData && notesData.length > 0) {
                    const ownerIds = [...new Set(notesData.map(n => n.owner_id))];
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, email, username')
                        .in('id', ownerIds);

                    const profileMap = new Map(profiles?.map(p => [p.id, p]));

                    const notesWithOwners = notesData.map(note => ({
                        ...note,
                        owner: profileMap.get(note.owner_id)
                    }));

                    setNotes(notesWithOwners);
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold">Shared Notes</h1>
                <div className="w-full md:w-64">
                    <Input
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
                        <Card key={note.id} hoverEffect className="p-5 cursor-pointer flex flex-col h-[200px] group">
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
        </div>
    );
};
