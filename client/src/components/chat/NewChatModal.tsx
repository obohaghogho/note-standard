import React, { useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { X } from 'lucide-react';

interface NewChatModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
    const [recipientId, setRecipientId] = useState(''); // Stores input text (username)
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
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
                // Import supabase here or pass it? It's globally available in the project likely, 
                // but better to use the imported instance from lib
                const { data } = await import('../../lib/supabase').then(m =>
                    m.supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .or(`username.ilike.%${recipientId}%,full_name.ilike.%${recipientId}%`)
                        .limit(5)
                );

                if (data) setSearchResults(data);
            } catch (err) {
                console.error("Search failed", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [recipientId]);

    const handleStartChat = async (username: string) => {
        setError('');
        setIsSubmitting(true);
        try {
            await startConversation(username);
            onClose();
            setRecipientId('');
            setSearchResults([]);
        } catch (err: any) {
            setError(err.message || 'Failed to start conversation');
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (recipientId) handleStartChat(recipientId);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 relative shadow-2xl">
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
                            Username
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
                                    <div className="p-3 text-center text-gray-400 text-sm">Searching...</div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(user => (
                                        <div
                                            key={user.id}
                                            onClick={() => handleStartChat(user.username)}
                                            className="p-3 hover:bg-gray-700 cursor-pointer flex items-center gap-3 transition-colors"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {user.avatar_url ? (
                                                    <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-xs font-bold text-white">
                                                        {(user.full_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-white truncate">
                                                    {user.full_name || user.username}
                                                </div>
                                                <div className="text-xs text-gray-400 truncate">
                                                    @{user.username}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-3 text-center text-gray-400 text-sm">No users found</div>
                                )}
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-gray-500 mt-1">
                        Select a user from the list to start chatting.
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
    );
};

export default NewChatModal;
