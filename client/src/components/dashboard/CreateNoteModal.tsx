import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ensureProfile } from '../../lib/supabaseSafe'; // Import ensureProfile
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Card } from '../common/Card';

interface CreateNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const CreateNoteModal = ({ isOpen, onClose, onSuccess }: CreateNoteModalProps) => {
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        setError('');

        try {
            // Ensure profile exists before creating note (fixes FK error)
            const hasProfile = await ensureProfile(user);
            if (!hasProfile) {
                throw new Error('User profile could not be verified. Please try again.');
            }

            // Parse tags: split by comma, trim, filter empty
            const tagArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

            const { error } = await supabase // Changed variable name from insertError to error
                .from('notes')
                .insert({
                    title,
                    content,
                    tags: tagArray,
                    owner_id: user.id, // Kept user.id as per original, but user?.id was in snippet. Sticking to original for minimal change.
                    is_private: isPrivate // Added is_private
                });

            if (error) throw error; // Used new error variable

            // Reset and close
            setTitle('');
            setContent('');
            setTags('');
            setIsPrivate(true); // Reset isPrivate state
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <Card className="w-full max-w-2xl relative z-10 p-6 animate-in fade-in zoom-in-95 duration-200" variant="glass">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Create New Note</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="noteTitle" className="sr-only">Note Title</label>
                        <input
                            id="noteTitle"
                            name="title"
                            type="text"
                            placeholder="Note Title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-transparent text-2xl font-bold placeholder-gray-500 focus:outline-none border-none p-0"
                            required
                            autoComplete="off"
                        />
                    </div>

                    <div className="h-[1px] bg-white/10 w-full" />

                    <div>
                        <label htmlFor="noteContent" className="sr-only">Note Content</label>
                        <textarea
                            id="noteContent"
                            name="content"
                            placeholder="Start typing your note..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full h-64 bg-transparent text-gray-300 placeholder-gray-600 focus:outline-none resize-none"
                            autoComplete="off"
                        />
                    </div>

                    <div>
                        <Input
                            id="noteTags"
                            name="tags"
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
                            id="isPrivate"
                            name="isPrivate"
                            checked={!isPrivate}
                            onChange={(e) => setIsPrivate(!e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 bg-[#121212] text-primary focus:ring-primary"
                        />
                        <label htmlFor="isPrivate" className="text-sm text-gray-300">
                            Make this note public (visible in Community Feed)
                        </label>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={loading}>
                            <Save size={16} />
                            Save Note
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};
