import { useState, useEffect } from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { X, Save, FileText, Tag, Bot, Sparkles, Languages, ListChecks, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseSafe';
import { toast } from 'react-hot-toast';
import { AdDisplay } from '../ads/AdDisplay';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

import type { Note } from '../../types/note';

const API_URL = import.meta.env.VITE_API_URL || '';

interface EditNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNoteUpdated: () => void;
    note: Note | null;
}

export const EditNoteModal = ({ isOpen, onClose, onNoteUpdated, note }: EditNoteModalProps) => {
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);

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

            // Increment note version on save!
            const nextVersion = (note.version || 1) + 1;

            const { error } = await supabase
                .from('notes')
                .update({
                    title,
                    content,
                    tags: tagArray,
                    is_private: isPrivate,
                    version: nextVersion,
                    updated_at: new Date().toISOString()
                })
                .eq('id', note.id)
                .eq('owner_id', user?.id);

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

    const handleAiAction = async (actionType: string) => {
        if (!note) return;
        setAiLoading(true);
        try {
            const token = localStorage.getItem("token");
            const { data } = await axios.post(
                `${API_URL}/api/notes/ai/assist`,
                {
                    noteId: note.id,
                    content,
                    actionType,
                    targetLanguage: actionType === 'translate' ? 'Spanish' : undefined
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (data.success && data.response) {
                setContent(data.response);
                toast.success(`Note ${actionType} complete!`);
            }
        } catch (err: any) {
            console.error(err);
            toast.error(err.response?.data?.error || "AI assist failed");
        } finally {
            setAiLoading(false);
        }
    };

    if (!isOpen || !note) return null;

    const aiTools = [
      { label: "Summarize Text", action: "summarize", icon: <FileText className="w-3.5 h-3.5" /> },
      { label: "Improve Clarity", action: "rewrite", icon: <Sparkles className="w-3.5 h-3.5" /> },
      { label: "Correct Grammar", action: "grammar", icon: <Loader2 className="w-3.5 h-3.5" /> },
      { label: "Translate to Spanish", action: "translate", icon: <Languages className="w-3.5 h-3.5" /> },
      { label: "Expand Points", action: "expand", icon: <Sparkles className="w-3.5 h-3.5 text-blue-400" /> },
      { label: "Generate Checklist", action: "checklist", icon: <ListChecks className="w-3.5 h-3.5 text-emerald-400" /> },
      { label: "Extract Action Items", action: "actions", icon: <ListChecks className="w-3.5 h-3.5 text-teal-400" /> }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto" variant="glass">
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-white/10">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <FileText className="text-emerald-400" />
                            Edit Note
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* 2-Column Grid */}
                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Left Column: Edit Fields */}
                        <div className="flex-grow space-y-4 lg:w-2/3">
                            <div>
                                <Input
                                    id="editNoteTitle"
                                    name="title"
                                    label="Title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Note title"
                                    className="bg-white/5 border-white/10 focus:border-emerald-500 text-lg font-semibold"
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
                                    className="w-full h-64 bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
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
                                    className="w-4 h-4 rounded border-gray-600 bg-[#121212] text-emerald-500 focus:ring-emerald-500"
                                />
                                <label htmlFor="editIsPrivate" className="text-sm text-gray-300">
                                    Make this note public (visible in Community Feed)
                                </label>
                            </div>

                            <AdDisplay
                                currentTags={tags.split(',').map(tag => tag.trim()).filter(Boolean)}
                                className="mt-2 text-left"
                            />
                        </div>

                        {/* Right Column: AI Assistant Panel */}
                        <div className="w-full lg:w-1/3 border-t lg:border-t-0 lg:border-l border-white/10 lg:pl-6 pt-6 lg:pt-0 flex flex-col gap-4">
                            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                <Bot className="w-5 h-5 text-emerald-400" />
                                <span className="text-sm font-bold text-white">AI Copilot</span>
                                {aiLoading && (
                                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin ml-auto" />
                                )}
                            </div>
                            
                            <p className="text-neutral-400 text-[10px] leading-relaxed">
                                Choose an action below to instantly analyze or rewrite your active note contents using LLaMA AI.
                            </p>

                            <div className="flex flex-col gap-2">
                                {aiTools.map((tool, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        disabled={aiLoading}
                                        onClick={() => handleAiAction(tool.action)}
                                        className="flex items-center gap-2.5 w-full p-2.5 rounded-xl border border-white/5 bg-neutral-950/40 hover:border-emerald-500/20 hover:bg-emerald-500/5 text-left text-neutral-300 hover:text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
                                    >
                                        {tool.icon}
                                        {tool.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={loading || aiLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={loading} disabled={aiLoading}>
                            <Save size={16} />
                            Update Note
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};
