import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { X, Edit2, Share2, Calendar, Lock, Globe } from 'lucide-react';

interface Note {
    id: string;
    title: string;
    content: string;
    tags: string[];
    created_at: string;
    is_private?: boolean;
}

interface ViewNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
    onShare: () => void;
    note: Note | null;
}

export const ViewNoteModal = ({ isOpen, onClose, onEdit, onShare, note }: ViewNoteModalProps) => {
    if (!isOpen || !note) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" variant="glass">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            {note.is_private ? <Lock size={20} /> : <Globe size={20} />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white leading-tight">{note.title || 'Untitled'}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Calendar size={12} />
                                    {new Date(note.created_at).toLocaleDateString()}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                                    note.is_private 
                                    ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' 
                                    : 'bg-primary/10 text-primary border-primary/20'
                                }`}>
                                    {note.is_private ? 'Private' : 'Public'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="text-gray-200 text-lg whitespace-pre-wrap leading-relaxed">
                        {note.content || 'No content...'}
                    </div>

                    {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-4">
                            {note.tags.map(tag => (
                                <span key={tag} className="text-xs px-2.5 py-1 bg-white/5 border border-white/10 text-gray-400 rounded-full">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <Button variant="ghost" className="text-gray-400 hover:text-white" onClick={onShare}>
                        <Share2 size={18} className="mr-2" />
                        Share
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={onClose}>
                            Close
                        </Button>
                        <Button onClick={onEdit}>
                            <Edit2 size={18} className="mr-2" />
                            Edit Note
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
