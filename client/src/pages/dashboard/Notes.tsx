import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Dropdown } from '../../components/common/Dropdown';
import { EditNoteModal } from '../../components/dashboard/EditNoteModal';
import { ShareNoteModal } from '../../components/dashboard/ShareNoteModal';
import { DeleteNoteModal } from '../../components/dashboard/DeleteNoteModal';
import { Search, Filter, Grid, List as ListIcon, Edit2, Share2, Trash2 } from 'lucide-react';
import { supabase, supabaseSafe } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

interface Note {
    id: string;
    title: string;
    content: string;
    created_at: string;
    tags: string[];
    is_private: boolean;
}

export const Notes = () => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal States
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [sharingNoteId, setSharingNoteId] = useState<string | null>(null);
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

    const fetchNotes = async () => {
        if (!user) return;
        try {
            const results = await supabaseSafe<Note[]>(
                `notes-list-${user.id}-${searchTerm}`,
                async () => {
                    const query = supabase
                        .from('notes')
                        .select('*')
                        .eq('owner_id', user.id)
                        .order('updated_at', { ascending: false });

                    if (searchTerm) {
                        query.ilike('title', `%${searchTerm}%`);
                    }
                    return query;
                },
                { fallback: [] }
            );
            
            setNotes(results || []);
        } catch (error) {
            console.error('Error loading notes:', error);
            toast.error('Failed to load notes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchNotes();
        }, 300); // Debounce search

        return () => clearTimeout(timeoutId);
    }, [user, searchTerm]);

    const handleDelete = (noteId: string) => {
        setDeletingNoteId(noteId);
    };

    const confirmDelete = async () => {
        if (!deletingNoteId) return;

        try {
            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', deletingNoteId);

            if (error) throw error;

            toast.success('Note deleted');
            setNotes(prev => prev.filter(n => n.id !== deletingNoteId));
        } catch (error) {
            console.error('Error deleting note:', error);
            toast.error('Failed to delete note');
        } finally {
            setDeletingNoteId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold">My Notes</h1>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-full md:w-64">
                        <Input
                            id="notes-search"
                            name="search"
                            icon={Search}
                            placeholder="Search notes..."
                            className="bg-[#121212]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Search my notes"
                        />
                    </div>
                    <Button variant="secondary" className="px-3">
                        <Filter size={18} />
                    </Button>
                    <div className="bg-[#121212] p-1 rounded-lg border border-white/10 flex">
                        <button className="p-2 rounded hover:bg-white/10 text-white bg-white/10">
                            <Grid size={16} />
                        </button>
                        <button className="p-2 rounded hover:bg-white/10 text-gray-400">
                            <ListIcon size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-gray-400 text-center py-10">Loading notes...</div>
            ) : notes.length === 0 ? (
                <div className="text-gray-400 text-center py-10">
                    {searchTerm ? 'No notes found matching your search.' : 'You have no notes yet.'}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {notes?.map((note) => (
                        <Card key={note.id} hoverEffect className="p-5 cursor-pointer flex flex-col h-[200px] group">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="text-xs text-gray-400">
                                        {new Date(note.created_at).toLocaleDateString()}
                                    </div>
                                    {!note.is_private && (
                                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium border border-primary/20">
                                            Public
                                        </span>
                                    )}
                                </div>
                                <Dropdown
                                    items={[
                                        {
                                            label: 'Edit',
                                            icon: Edit2,
                                            onClick: () => setEditingNote(note)
                                        },
                                        {
                                            label: 'Share',
                                            icon: Share2,
                                            onClick: () => setSharingNoteId(note.id)
                                        },
                                        {
                                            label: 'Delete',
                                            icon: Trash2,
                                            onClick: () => handleDelete(note.id),
                                            variant: 'danger'
                                        }
                                    ]}
                                />
                            </div>
                            <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors truncate">
                                {note.title || 'Untitled'}
                            </h3>
                            <p className="text-gray-400 text-sm line-clamp-3 mb-4 flex-1">
                                {note.content || 'No content...'}
                            </p>
                            <div className="flex flex-wrap gap-2 overflow-hidden mt-auto">
                                {note.tags?.slice(0, 3).map(tag => (
                                    <span key={tag} className="text-xs px-2 py-0.5 border border-white/10 text-gray-400 rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modals */}
            <EditNoteModal
                isOpen={!!editingNote}
                onClose={() => setEditingNote(null)}
                note={editingNote}
                onNoteUpdated={fetchNotes}
            />

            <ShareNoteModal
                isOpen={!!sharingNoteId}
                onClose={() => setSharingNoteId(null)}
                noteId={sharingNoteId}
            />

            <DeleteNoteModal
                isOpen={!!deletingNoteId}
                onClose={() => setDeletingNoteId(null)}
                onConfirm={confirmDelete}
            />
        </div>
    );
};
