import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { X, UserPlus, Search, Trash2, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

interface ShareNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    noteId: string | null;
}

interface Profile {
    id: string;
    email: string;
    username: string;
    avatar_url: string;
}

interface SharedUser {
    id: string;
    shared_with_user_id: string;
    permission: string;
    profile: Profile;
}

export const ShareNoteModal = ({ isOpen, onClose, noteId }: ShareNoteModalProps) => {
    const { user, session } = useAuth();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Profile[]>([]);
    const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);

    useEffect(() => {
        if (isOpen && noteId) {
            fetchSharedUsers();
        } else {
            setSharedUsers([]);
            setSearchResults([]);
            setEmail('');
        }
    }, [isOpen, noteId]);

    const fetchSharedUsers = async () => {
        if (!noteId) return;
        try {
            // We need to fetch the shared_notes and join with profiles
            // But Supabase simple join might require setup. 
            // Let's do a two-step fetch if simple join fails or is complex to type here.
            // Attempting simple join:
            const { data, error } = await supabase
                .from('shared_notes')
                .select(`
                    id,
                    shared_with_user_id,
                    permission,
                    profile:profiles!shared_with_user_id (id, email, username, avatar_url)
                `)
                .eq('note_id', noteId);

            if (error) throw error;

            setSharedUsers(data as unknown as SharedUser[] || []);
        } catch (error) {
            console.error('Error fetching shared users:', error);
        }
    };

    const handleSearch = async () => {
        if (!email.trim()) return;
        setSearching(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .ilike('email', `%${email}%`)
                .neq('id', user?.id) // Don't show self
                .limit(5);

            if (error) throw error;
            setSearchResults(data || []);
        } catch (error) {
            console.error('Error searching users:', error);
        } finally {
            setSearching(false);
        }
    };

    const handleShare = async (targetId: string) => {
        if (!noteId) return;
        setLoading(true);
        try {
            // Check if already shared
            const exists = sharedUsers.some(u => u.shared_with_user_id === targetId);
            if (exists) {
                toast.error('User already has access');
                return;
            }

            const res = await fetch(`${API_URL}/api/notes/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    noteId,
                    targetEmail: searchResults.find(p => p.id === targetId)?.email,
                    permission: 'read'
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to share');
            }

            toast.success('Note shared successfully');
            setEmail('');
            setSearchResults([]);
            fetchSharedUsers();
        } catch (error) {
            console.error('Error sharing note:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to share note');
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (shareId: string) => {
        try {
            const { error } = await supabase
                .from('shared_notes')
                .delete()
                .eq('id', shareId);

            if (error) throw error;

            toast.success('Access revoked');
            setSharedUsers(prev => prev.filter(u => u.id !== shareId));
        } catch (error) {
            console.error('Error revoking access:', error);
            toast.error('Failed to revoke access');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-lg" variant="glass">
                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-white/10">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Users className="text-primary" size={24} />
                            Share Note
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Search Section */}
                    <div className="space-y-4">
                        <label htmlFor="userSearch" className="text-sm font-medium text-gray-400">Add people</label>
                        <div className="flex gap-2">
                            <Input
                                id="userSearch"
                                name="userSearch"
                                icon={Search}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search by email..."
                                className="bg-white/5 border-white/10"
                            />
                            <Button onClick={handleSearch} disabled={searching || !email}>
                                Search
                            </Button>
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                                {searchResults.map(profile => (
                                    <div key={profile.id} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                                                {profile.email[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{profile.username || 'User'}</p>
                                                <p className="text-xs text-gray-400">{profile.email}</p>
                                            </div>
                                        </div>
                                        <Button size="sm" onClick={() => handleShare(profile.id)} disabled={loading}>
                                            <UserPlus size={16} />
                                            Add
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Shared With List */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <p className="text-sm font-medium text-gray-400">People with access</p>
                        {sharedUsers.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">No one has access to this note yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {sharedUsers.map(share => (
                                    <div key={share.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-xs">
                                                {(share.profile?.email?.[0] || '?').toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{share.profile?.username || 'User'}</p>
                                                <p className="text-xs text-gray-400">{share.profile?.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">
                                                {share.permission}
                                            </span>
                                            <button
                                                onClick={() => handleRevoke(share.id)}
                                                className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
