import { useState, useEffect } from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { X, Save, FileText, Tag } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { AdDisplay } from '../ads/AdDisplay';

interface Note {
    id: string;
    title: string;
    content: string;
    tags: string[];
    is_private?: boolean;
}

interface EditNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNoteUpdated: () => void;
    note: Note | null;
}

export const EditNoteModal = ({ isOpen, onClose, onNoteUpdated, note }: EditNoteModalProps) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (note) {
            setTitle(note.title || '');
            setContent(note.content || '');
            setTags(note.tags ? note.tags.join(', ') : '');
            setIsPrivate(note.is_private ?? true);
        }
    }, [note]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!note) return;

        setLoading(true);

        try {
            const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

            const { error } = await supabase
                .from('notes')
                .update({
                    title,
                    content,
                    tags: tagArray,
                    is_private: isPrivate,
                    updated_at: new Date().toISOString()
                })
                .eq('id', note.id);

            if (error) throw error;

            toast.success('Note updated successfully!');
            onNoteUpdated();
            onClose();
        } catch (error) {
            console.error('Error updating note:', error);
            toast.error('Failed to update note');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !note) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" variant="glass">
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-white/10">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <FileText className="text-primary" />
                            Edit Note
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Input
                                id="editNoteTitle"
                                name="title"
                                label="Title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Note title"
                                className="bg-white/5 border-white/10 focus:border-primary text-lg font-semibold"
                                required
                                autoComplete="off"
                            />
                        </div>

                        <div>
                            <label htmlFor="editNoteContent" className="block text-sm font-medium text-gray-400 mb-1">Content</label>
                            <textarea
                                id="editNoteContent"
                                name="content"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Write your thoughts..."
                                className="w-full h-64 bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                                required
                                autoComplete="off"
                            />
                        </div>

                        <div>
                            <Input
                                id="editNoteTags"
                                name="tags"
                                icon={Tag}
                                label="Tags (comma separated)"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="work, ideas, important"
                                className="bg-[#121212]"
                                autoComplete="off"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="editIsPrivate"
                                name="isPrivate"
                                checked={!isPrivate}
                                onChange={(e) => setIsPrivate(!e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 bg-[#121212] text-primary focus:ring-primary"
                            />
                            <label htmlFor="editIsPrivate" className="text-sm text-gray-300">
                                Make this note public (visible in Community Feed)
                            </label>
                        </div>

                        {/* Contextual Ad */}
                        <AdDisplay
                            currentTags={tags.split(',').map(tag => tag.trim()).filter(Boolean)}
                            className="mt-2 text-left"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={loading}>
                            <Save size={16} />
                            Update Note
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};
