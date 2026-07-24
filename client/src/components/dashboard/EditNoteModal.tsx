import { useState, useEffect, useRef } from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { X, Save, FileText, Tag, Bot, Sparkles, Languages, ListChecks, Loader2, Folder, Bell, Paperclip, Pin, Clock, CheckSquare } from 'lucide-react';
import { supabase } from '../../lib/supabaseSafe';
import { toast } from 'react-hot-toast';
import { AdDisplay } from '../ads/AdDisplay';
import { useAuth } from '../../context/AuthContext';
import { useNotes } from '../../context/NotesContext';
import { useNotesDashboard } from '../../context/NotesDashboardContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import axios from 'axios';

import type { Note } from '../../types/note';
import { ChecklistModule, type ChecklistItem } from './ChecklistModule';
import { AttachmentsList } from './AttachmentsList';
import { FolderModal } from './FolderModal';
import { DrawingModule } from './DrawingModule';
import { VoiceModule } from './VoiceModule';
import { ImageModule } from './ImageModule';

const API_URL = import.meta.env.VITE_API_URL || '';

interface EditNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNoteUpdated: () => void;
    note: Note | null;
}

export const EditNoteModal = ({ isOpen, onClose, onNoteUpdated, note }: EditNoteModalProps) => {
    const { user } = useAuth();
    const { setNotes } = useNotes();
    const { categories, refreshDashboard } = useNotesDashboard();

    // Fields states
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [isPinned, setIsPinned] = useState(false);
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [noteType, setNoteType] = useState<'text' | 'checklist' | 'voice' | 'image' | 'drawing' | 'document'>('text');
    const [color, setColor] = useState('');
    
    // Reminders states
    const [reminderAt, setReminderAt] = useState('');
    const [repeatType, setRepeatType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');

    // Checklist structured state
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

    // UI/UX state
    const [activeTab, setActiveTab] = useState<'edit' | 'attachments'>('edit');
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);

    // Track if first load has finished to prevent immediate autosave on open
    const isFirstLoad = useRef(true);

    useEffect(() => {
        if (note) {
            isFirstLoad.current = true;
            setTitle(note.title || '');
            setContent(note.content || '');
            setTags(note.tags ? note.tags.join(', ') : '');
            setIsPrivate(note.is_private ?? true);
            setIsPinned(note.is_pinned ?? false);
            setCategoryId(note.category_id || null);
            setNoteType(note.note_type || 'text');
            setColor(note.color || '');
            setReminderAt(note.reminder_at ? new Date(note.reminder_at).toISOString().slice(0, 16) : '');
            setRepeatType(note.repeat_type || 'none');
            
            // Load checklist items from metadata JSONB
            if (note.note_type === 'checklist' && note.metadata?.items) {
                setChecklistItems(note.metadata.items);
            } else {
                setChecklistItems([]);
            }
            
            setActiveTab('edit');
            setAutosaveStatus(null);
            setTimeout(() => {
                isFirstLoad.current = false;
            }, 100);
        }
    }, [note]);

    // Autosave Effect
    useEffect(() => {
        if (!note || isFirstLoad.current) return;

        setAutosaveStatus('saving');
        const delayDebounceFn = setTimeout(async () => {
            try {
                const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                const nextVersion = (note.version || 1) + 1;
                
                // Calculate word count
                const textContent = content.replace(/<[^>]*>/g, ' ');
                const wordCount = textContent.split(/\s+/).filter(Boolean).length;
                const readingTime = Math.max(1, Math.round(wordCount / 200 * 60)); // in seconds

                const metadataPayload = noteType === 'checklist' ? { items: checklistItems } : note.metadata || {};

                const updatedFields = {
                    title,
                    content,
                    tags: tagArray,
                    is_private: isPrivate,
                    is_pinned: isPinned,
                    category_id: categoryId,
                    note_type: noteType,
                    color: color || null,
                    reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
                    repeat_type: repeatType,
                    version: nextVersion,
                    word_count: wordCount,
                    reading_time: readingTime,
                    metadata: metadataPayload,
                    updated_at: new Date().toISOString()
                };

                const { error } = await supabase
                    .from('notes')
                    .update(updatedFields)
                    .eq('id', note.id)
                    .eq('owner_id', user?.id);

                if (error) throw error;

                setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...updatedFields } : n));
                setAutosaveStatus('saved');
                refreshDashboard();
            } catch (err) {
                console.error('[Autosave] Error saving note:', err);
                setAutosaveStatus('error');
            }
        }, 1500); // 1.5 seconds debounce

        return () => clearTimeout(delayDebounceFn);
    }, [title, content, tags, isPrivate, isPinned, categoryId, noteType, color, reminderAt, repeatType, checklistItems, note?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!note) return;

        setLoading(true);
        try {
            const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            const nextVersion = (note.version || 1) + 1;
            
            const textContent = content.replace(/<[^>]*>/g, ' ');
            const wordCount = textContent.split(/\s+/).filter(Boolean).length;
            const readingTime = Math.max(1, Math.round(wordCount / 200 * 60));

            const metadataPayload = noteType === 'checklist' ? { items: checklistItems } : note.metadata || {};

            const updatedFields = {
                title,
                content,
                tags: tagArray,
                is_private: isPrivate,
                is_pinned: isPinned,
                category_id: categoryId,
                note_type: noteType,
                color: color || null,
                reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
                repeat_type: repeatType,
                version: nextVersion,
                word_count: wordCount,
                reading_time: readingTime,
                metadata: metadataPayload,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('notes')
                .update(updatedFields)
                .eq('id', note.id)
                .eq('owner_id', user?.id);

            if (error) throw error;

            toast.success('Note saved successfully!');
            setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...updatedFields } : n));
            onNoteUpdated();
            refreshDashboard();
            onClose();
        } catch (error) {
            console.error('Error saving note:', error);
            toast.error('Failed to save note');
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
                if (actionType === 'checklist') {
                    // If AI generated a checklist, parse markdown into ChecklistItems
                    const lines = data.response.split('\n');
                    const items: ChecklistItem[] = [];
                    lines.forEach((line: string) => {
                        const match = line.match(/^[-*]\s+\[([ x])\]\s+(.+)$/i);
                        if (match) {
                            items.push({
                                id: crypto.randomUUID(),
                                text: match[2].trim(),
                                completed: match[1].toLowerCase() === 'x',
                                indent: 0
                            });
                        }
                    });
                    setNoteType('checklist');
                    setChecklistItems(items);
                    toast.success("AI Checklist generated!");
                } else {
                    setContent(data.response);
                    toast.success(`Note ${actionType} complete!`);
                }
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
      { label: "Summarize Text", action: "summarize", icon: <FileText className="w-3.5 h-3.5 text-blue-400" /> },
      { label: "Improve Clarity", action: "rewrite", icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> },
      { label: "Correct Grammar", action: "grammar", icon: <Loader2 className="w-3.5 h-3.5 text-emerald-400" /> },
      { label: "Translate to Spanish", action: "translate", icon: <Languages className="w-3.5 h-3.5 text-pink-400" /> },
      { label: "Expand Points", action: "expand", icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" /> },
      { label: "Generate Checklist", action: "checklist", icon: <ListChecks className="w-3.5 h-3.5 text-teal-400" /> },
      { label: "Extract Action Items", action: "actions", icon: <ListChecks className="w-3.5 h-3.5 text-rose-400" /> }
    ];

    const PRESET_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#EF4444", "#06B6D4", "#F97316"];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
            <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-200" variant="glass">
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between bg-neutral-900/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                            {noteType === 'checklist' ? <CheckSquare size={20} /> : <FileText size={20} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                Workspace Editor
                                {autosaveStatus === 'saving' && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full animate-pulse">Saving...</span>
                                )}
                                {autosaveStatus === 'saved' && (
                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Autosaved</span>
                                )}
                                {autosaveStatus === 'error' && (
                                  <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Error saving</span>
                                )}
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Main scrollable content */}
                <div className="flex-grow overflow-y-auto flex flex-col md:flex-row gap-6 p-6">
                    {/* Left Column: Form Fields */}
                    <div className="flex-grow space-y-5 md:w-2/3">
                        {/* Tab Switcher */}
                        <div className="flex border-b border-white/10 pb-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('edit')}
                                className={`px-4 py-1.5 text-sm font-semibold transition-all border-b-2 ${
                                    activeTab === 'edit'
                                        ? 'border-emerald-500 text-white'
                                        : 'border-transparent text-neutral-400 hover:text-white'
                                }`}
                            >
                                Note Content
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('attachments')}
                                className={`px-4 py-1.5 text-sm font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
                                    activeTab === 'attachments'
                                        ? 'border-emerald-500 text-white'
                                        : 'border-transparent text-neutral-400 hover:text-white'
                                }`}
                            >
                                <Paperclip className="w-3.5 h-3.5" />
                                Attachments
                            </button>
                        </div>

                        {activeTab === 'edit' ? (
                            <div className="space-y-4">
                                {/* Title */}
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

                                {/* Editor block */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-semibold text-neutral-400">Content</label>
                                        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/5 text-[10px] flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => setNoteType('text')}
                                                className={`px-2 py-0.5 rounded font-bold transition-all ${
                                                    noteType === 'text' ? 'bg-emerald-500 text-white shadow' : 'text-neutral-400 hover:text-white'
                                                }`}
                                            >
                                                Text Editor
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNoteType('checklist')}
                                                className={`px-2 py-0.5 rounded font-bold transition-all ${
                                                    noteType === 'checklist' ? 'bg-emerald-500 text-white shadow' : 'text-neutral-400 hover:text-white'
                                                }`}
                                            >
                                                Checklist
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNoteType('voice')}
                                                className={`px-2 py-0.5 rounded font-bold transition-all ${
                                                    noteType === 'voice' ? 'bg-emerald-500 text-white shadow' : 'text-neutral-400 hover:text-white'
                                                }`}
                                            >
                                                Voice
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNoteType('drawing')}
                                                className={`px-2 py-0.5 rounded font-bold transition-all ${
                                                    noteType === 'drawing' ? 'bg-emerald-500 text-white shadow' : 'text-neutral-400 hover:text-white'
                                                }`}
                                            >
                                                Canvas
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNoteType('image')}
                                                className={`px-2 py-0.5 rounded font-bold transition-all ${
                                                    noteType === 'image' ? 'bg-emerald-500 text-white shadow' : 'text-neutral-400 hover:text-white'
                                                }`}
                                            >
                                                Image
                                            </button>
                                        </div>
                                    </div>

                                     {noteType === 'checklist' ? (
                                        <ChecklistModule
                                            items={checklistItems}
                                            onChange={setChecklistItems}
                                        />
                                    ) : noteType === 'voice' ? (
                                        <VoiceModule noteId={note.id} />
                                    ) : noteType === 'drawing' ? (
                                        <DrawingModule noteId={note.id} />
                                    ) : noteType === 'image' ? (
                                        <ImageModule noteId={note.id} />
                                    ) : (
                                        <div className="quill-editor bg-neutral-900/40 border border-white/10 rounded-xl overflow-hidden focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20">
                                            <ReactQuill
                                                theme="snow"
                                                value={content}
                                                onChange={setContent}
                                                placeholder="Write your thoughts..."
                                                modules={{
                                                    toolbar: [
                                                        [{ 'header': [1, 2, 3, false] }],
                                                        ['bold', 'italic', 'underline', 'strike'],
                                                        [{ 'list': 'ordered'}, { 'list': 'bullet'}],
                                                        ['code-block', 'link'],
                                                        ['clean']
                                                    ]
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Folders & Tags Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Folders Dropdown */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label htmlFor="folderSelect" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">Folder</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsFolderModalOpen(true)}
                                                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold"
                                            >
                                                Manage Folders
                                            </button>
                                        </div>
                                        <select
                                            id="folderSelect"
                                            name="folderSelect"
                                            value={categoryId || ''}
                                            onChange={(e) => setCategoryId(e.target.value || null)}
                                            className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none"
                                        >
                                            <option value="">Uncategorized</option>
                                            {categories.map((cat) => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Tags Input */}
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
                                </div>

                                {/* Custom Color presets */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">Note Theme Color</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setColor('')}
                                            className={`w-6 h-6 rounded-full border border-white/10 bg-neutral-900 cursor-pointer transition-transform relative flex items-center justify-center`}
                                        >
                                            {color === '' && <div className="w-2.5 h-2.5 rounded-full bg-white shadow" />}
                                        </button>
                                        {PRESET_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setColor(c)}
                                                className="w-6 h-6 rounded-full cursor-pointer hover:scale-115 transition-transform relative flex items-center justify-center border border-black/20"
                                                style={{ backgroundColor: c }}
                                            >
                                                {color === c && <div className="w-2.5 h-2.5 rounded-full bg-white shadow" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <AttachmentsList noteId={note.id} />
                        )}
                    </div>

                    {/* Right Column: Settings & AI copilot */}
                    <div className="w-full md:w-1/3 border-t md:border-t-0 md:border-l border-white/10 md:pl-6 pt-6 md:pt-0 flex flex-col gap-6 md:min-h-0">
                        {/* Reminders section */}
                        <div className="space-y-4 p-4 rounded-2xl border border-white/5 bg-neutral-950/20">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/5 pb-2">
                                <Bell className="w-4 h-4 text-emerald-400 animate-swing" />
                                Reminder Settings
                            </h4>

                            <div>
                                <label htmlFor="reminderTime" className="block text-[10px] text-neutral-500 font-bold uppercase mb-1">Set Date & Time</label>
                                <input
                                    id="reminderTime"
                                    name="reminderTime"
                                    type="datetime-local"
                                    value={reminderAt}
                                    onChange={(e) => setReminderAt(e.target.value)}
                                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                                />
                            </div>

                            <div>
                                <label htmlFor="reminderRepeat" className="block text-[10px] text-neutral-500 font-bold uppercase mb-1">Recurrence</label>
                                <select
                                    id="reminderRepeat"
                                    name="reminderRepeat"
                                    value={repeatType}
                                    onChange={(e: any) => setRepeatType(e.target.value)}
                                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                                >
                                    <option value="none">One-time (None)</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                        </div>

                        {/* RLS Privacy */}
                        <div className="flex items-center gap-2 px-1">
                            <input
                                type="checkbox"
                                id="editIsPrivate"
                                name="isPrivate"
                                checked={!isPrivate}
                                onChange={(e) => setIsPrivate(!e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 bg-[#121212] text-emerald-500 focus:ring-emerald-500"
                            />
                            <label htmlFor="editIsPrivate" className="text-xs text-gray-300 font-semibold cursor-pointer">
                                Share publicly in Community Feed
                            </label>
                        </div>

                        {/* AI Copilot Panel */}
                        <div className="flex-grow flex flex-col gap-4 min-h-0">
                            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                <Bot className="w-5 h-5 text-emerald-400" />
                                <span className="text-sm font-bold text-white">AI Copilot</span>
                                {aiLoading && (
                                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin ml-auto" />
                                )}
                            </div>
                            
                            <p className="text-neutral-400 text-[10px] leading-relaxed">
                                Instantly rewrite, translate, or expand your note contents using groq llama-3.1 AI models.
                            </p>

                            <div className="flex flex-col gap-2 flex-1 min-h-[150px] overflow-y-auto pr-1 scrollbar-thin">
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

                        <AdDisplay
                            currentTags={tags.split(',').map(tag => tag.trim()).filter(Boolean)}
                            className="mt-auto text-left"
                        />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-4 border-t border-white/10 flex justify-between items-center bg-white/[0.01]">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-500">
                        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'text-amber-400 fill-amber-400' : 'text-neutral-600'}`} />
                        <button
                            type="button"
                            onClick={() => setIsPinned(!isPinned)}
                            className="hover:text-white cursor-pointer"
                        >
                            {isPinned ? 'Unpin Note' : 'Pin Note'}
                        </button>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={loading || aiLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" onClick={handleSubmit} loading={loading} disabled={aiLoading}>
                            <Save size={16} />
                            Save & Close
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Nested modals */}
            <FolderModal
              isOpen={isFolderModalOpen}
              onClose={() => setIsFolderModalOpen(false)}
            />
        </div>
    );
};
