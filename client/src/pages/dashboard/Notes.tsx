import { useEffect, useState } from 'react';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Dropdown } from '../../components/common/Dropdown';
import { EditNoteModal } from '../../components/dashboard/EditNoteModal';
import { ViewNoteModal } from '../../components/dashboard/ViewNoteModal';
import { ShareNoteModal } from '../../components/dashboard/ShareNoteModal';
import { DeleteNoteModal } from '../../components/dashboard/DeleteNoteModal';
import { Search, Filter, Grid, List as ListIcon, Edit2, Share2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';
import { useNotes } from '../../context/NotesContext';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';

import type { Note } from '../../types/note';

function NotesContent() {
    const { user } = useAuth();
    const { notes, loading, refreshNotes } = useNotes();
    console.log("Notes rendered");
    console.log("Page rendered (Notes)");
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'title'>('latest');

    // Modal States
    const [viewingNote, setViewingNote] = useState<Note | null>(null);
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [sharingNoteId, setSharingNoteId] = useState<string | null>(null);
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // fetchNotes is now handled by NotesContext.refreshNotes
    // We only call it when filters change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            refreshNotes(searchTerm, sortBy);
        }, 300); // Debounce search

        return () => clearTimeout(timeoutId);
    }, [user, searchTerm, sortBy, refreshNotes]);

    const handleDelete = (noteId: string) => {
        setDeletingNoteId(noteId);
    };

    const confirmDelete = async () => {
        if (!deletingNoteId || !user) return;
        setIsDeleting(true);

        try {
            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', deletingNoteId)
                .eq('owner_id', user.id);

            if (error) throw error;
            toast.success('Note deleted');
            // Success: state will be updated via Realtime automatically in NotesContext
        } catch (error) {
            console.error('Error deleting note:', error);
            toast.error('Failed to delete note');
        } finally {
            setIsDeleting(false);
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
                    <Dropdown
                        trigger={
                            <Button variant="secondary" className="px-3">
                                <Filter size={18} />
                            </Button>
                        }
                        items={[
                            { label: 'Latest Modified', onClick: () => setSortBy('latest'), active: sortBy === 'latest' },
                            { label: 'Oldest Modified', onClick: () => setSortBy('oldest'), active: sortBy === 'oldest' },
                            { label: 'Title (A-Z)', onClick: () => setSortBy('title'), active: sortBy === 'title' },
                        ]}
                    />
                    <div className="bg-[#121212] p-1 rounded-lg border border-white/10 flex">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={cn(
                                "p-2 rounded hover:bg-white/10 transition-colors",
                                viewMode === 'grid' ? "text-white bg-white/10" : "text-gray-400"
                            )}
                        >
                            <Grid size={16} />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={cn(
                                "p-2 rounded hover:bg-white/10 transition-colors",
                                viewMode === 'list' ? "text-white bg-white/10" : "text-gray-400"
                            )}
                        >
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
                <div className={cn(
                    viewMode === 'grid' 
                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                        : "flex flex-col gap-3"
                )}>
                    {notes?.map((note) => (
                        <Card 
                            key={note.id} 
                            hoverEffect 
                            className={cn(
                                "cursor-pointer group relative",
                                viewMode === 'grid' ? "p-5 flex flex-col h-[200px]" : "p-4 flex items-center justify-between gap-4 h-auto"
                            )}
                            onClick={() => setViewingNote(note)}
                        >
                            <div className={cn(
                                "flex flex-1 min-w-0",
                                viewMode === 'grid' ? "flex-col" : "items-center gap-4"
                            )}>
                                <div className={cn(
                                    "flex items-center gap-2",
                                    viewMode === 'grid' ? "mb-3" : "w-32 shrink-0"
                                )}>
                                    <div className="text-xs text-gray-400">
                                        {new Date(note.created_at).toLocaleDateString()}
                                    </div>
                                    {!note.is_private && (
                                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium border border-primary/20">
                                            Public
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors truncate">
                                        {note.title || 'Untitled'}
                                    </h3>
                                    {viewMode === 'grid' && (
                                        <p className="text-gray-400 text-sm line-clamp-3 mb-4 flex-1">
                                            {note.content || 'No content...'}
                                        </p>
                                    )}
                                </div>
                                {viewMode === 'grid' && (
                                    <div className="flex flex-wrap gap-2 overflow-hidden mt-auto">
                                        {note.tags?.slice(0, 3).map(tag => (
                                            <span key={tag} className="text-xs px-2 py-0.5 border border-white/10 text-gray-400 rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {viewMode === 'list' && (
                                <div className="flex items-center gap-4">
                                     <div className="hidden sm:flex flex-wrap gap-2 overflow-hidden">
                                        {note.tags?.slice(0, 2).map(tag => (
                                            <span key={tag} className="text-[10px] px-2 py-0.5 border border-white/10 text-gray-400 rounded-full">
                                                {tag}
                                            </span>
                                        ))}
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
                            )}

                            {viewMode === 'grid' && (
                                <div className="absolute top-4 right-4">
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
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Modals */}
            <ViewNoteModal
                isOpen={!!viewingNote}
                onClose={() => setViewingNote(null)}
                note={viewingNote}
                onEdit={() => {
                    setEditingNote(viewingNote);
                    setViewingNote(null);
                }}
                onShare={() => {
                    setSharingNoteId(viewingNote?.id || null);
                    setViewingNote(null);
                }}
            />

            <EditNoteModal
                isOpen={!!editingNote}
                onClose={() => setEditingNote(null)}
                note={editingNote}
                onNoteUpdated={() => refreshNotes(searchTerm, sortBy)}
            />

            <ShareNoteModal
                isOpen={!!sharingNoteId}
                onClose={() => setSharingNoteId(null)}
                noteId={sharingNoteId}
            />

            <DeleteNoteModal
                isOpen={!!deletingNoteId}
                onClose={() => !isDeleting && setDeletingNoteId(null)}
                onConfirm={confirmDelete}
                loading={isDeleting}
            />
        </div>
    );
}

export default function Notes() {
    return (
        <ErrorBoundary fallback={<div className="p-8 text-center text-red-500 bg-red-500/5 rounded-xl border border-red-500/10">Something went wrong loading your notes. <button onClick={() => window.location.reload()} className="underline ml-2">Try again</button></div>}>
            <NotesContent />
        </ErrorBoundary>
    );
}
