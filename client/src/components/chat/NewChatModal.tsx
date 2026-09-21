import React, { useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { X, UserPlus, Loader2 } from 'lucide-react';
import SecureImage from '../common/SecureImage';
import { supabase } from '../../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import { PublicProfileModal } from '../profile/PublicProfileModal';

interface NewChatModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface UserResult {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
}

const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
    const [recipientId, setRecipientId] = useState(''); // Stores input text (username)
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [startingUserId, setStartingUserId] = useState<string | null>(null);
    const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<UserResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [, setSearchParams] = useSearchParams();
    const { startConversation } = useChat();

    // Real-time search for users
    React.useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (!recipientId.trim()) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const { data } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .or(`username.ilike.%${recipientId}%,full_name.ilike.%${recipientId}%`)
                        .limit(5);

                if (data) setSearchResults(data);
            } catch (err) {
                console.error("Search failed", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [recipientId]);

    const handleStartChat = async (targetUser: string, targetId?: string) => {
        if (!targetUser || isSubmitting || startingUserId) return;
        setError('');
        setIsSubmitting(true);
        if (targetId) setStartingUserId(targetId);
        try {
            const newId = await startConversation(targetUser);
            if (newId) {
                setSearchParams({ id: newId }, { replace: true });
            }
            onClose();
            setRecipientId('');
            setSearchResults([]);
        } catch (err: unknown) {
            const error = err as Error;
            setError(error.message || 'Failed to start conversation');
        } finally {
            setIsSubmitting(false);
            setStartingUserId(null);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (recipientId) handleStartChat(recipientId);
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-5 md:p-6 relative shadow-2xl">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>

                    <h2 className="text-xl font-bold text-white mb-4">Start New Chat</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <label htmlFor="newChatUsername" className="block text-sm font-medium text-gray-400 mb-1">
                                Username or Full Name
                            </label>
                            <input
                                id="newChatUsername"
                                type="text"
                                value={recipientId}
                                onChange={(e) => setRecipientId(e.target.value)}
                                placeholder="Type to search users..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                required
                            />

                            {/* Search Results Dropdown */}
                            {recipientId && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10 max-h-60 overflow-y-auto">
                                    {isSearching ? (
                                        <div className="p-3 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                                            <Loader2 size={16} className="animate-spin text-blue-500" />
                                            Searching...
                                        </div>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map(user => (
                                            <div
                                                key={user.id}
                                                className="p-3 hover:bg-gray-700/60 flex items-center justify-between gap-3 transition-colors border-b border-gray-700/40 last:border-0"
                                            >
                                                <div 
                                                    onClick={() => setSelectedProfileUserId(user.id)}
                                                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 group"
                                                    title="Click to view profile"
                                                >
                                                    <div className="w-9 h-9 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:ring-2 group-hover:ring-blue-500 transition-all">
                                                        {user.avatar_url ? (
                                                            <SecureImage src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" fallbackType="profile" />
                                                        ) : (
                                                            <span className="text-xs font-bold text-white">
                                                                {(user.full_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                                                            {user.full_name || user.username}
                                                        </div>
                                                        <div className="text-xs text-gray-400 truncate">
                                                            @{user.username}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={isSubmitting || startingUserId === user.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStartChat(user.username || user.id, user.id);
                                                    }}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition-colors shadow-sm"
                                                >
                                                    {startingUserId === user.id ? (
                                                        <Loader2 size={13} className="animate-spin" />
                                                    ) : (
                                                        <UserPlus size={13} />
                                                    )}
                                                    {startingUserId === user.id ? 'Adding...' : 'Add'}
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-3 text-center text-gray-400 text-sm">No users found</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-gray-500 mt-1">
                            Click avatar/name to preview profile, or click <strong>Add</strong> to start a chat.
                        </p>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? 'Starting...' : 'Start Chat'}
                        </button>
                    </form>
                </div>
            </div>

            {selectedProfileUserId && (
                <PublicProfileModal
                    userId={selectedProfileUserId}
                    onClose={() => setSelectedProfileUserId(null)}
                />
            )}
        </>
    );
};

export default NewChatModal;

