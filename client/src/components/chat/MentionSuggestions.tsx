import React from 'react';
import SecureImage from '../common/SecureImage';

interface User {
    id: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
}

interface MentionSuggestionsProps {
    users: User[];
    onSelect: (user: User) => void;
}

export const MentionSuggestions: React.FC<MentionSuggestionsProps> = ({ users, onSelect }) => {
    if (users.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
            <div className="p-2 border-b border-gray-700">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider px-2">Mention User</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
                {users.map(user => (
                    <button
                        key={user.id}
                        type="button"
                        onClick={() => onSelect(user)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left group"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {user.avatar_url ? (
                                <SecureImage src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xs font-bold text-blue-400">
                                    {(user.full_name?.[0] || user.username[0]).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors truncate">
                                {user.full_name || user.username}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">@{user.username}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
