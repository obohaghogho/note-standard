import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Check, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePresence } from '../../context/PresenceContext';
import SecureImage from '../common/SecureImage';

const ConversationList: React.FC = () => {
    const { conversations, activeConversationId, setActiveConversationId, loading } = useChat();
    const { user } = useAuth();
    const { isUserOnline } = usePresence();

    if (loading) return <div className="p-4 text-gray-400">Loading chats...</div>;

    if (conversations.length === 0) {
        return <div className="p-4 text-gray-500">No conversations yet.</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-900 border-r border-gray-800 scrollbar-thin scrollbar-thumb-gray-800">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Messages</h2>
                <div className="flex items-center gap-2">
                    {/* Add Filter/Search icons here if needed */}
                </div>
            </div>

            {conversations.map((conv) => {
                let displayName = conv.name;
                let displayAvatar = null;
                let isOnline = false;
                
                if (conv.type === 'direct') {
                    const otherMember = conv.members.find((m: { user_id: string; profile?: any }) => m.user_id !== user?.id);
                    if (otherMember && otherMember.profile) {
                        displayName = otherMember.profile.full_name || otherMember.profile.username || 'Unknown User';
                        displayAvatar = otherMember.profile.avatar_url;
                        isOnline = isUserOnline(otherMember.user_id);
                    }
                }

                const lastMsg = conv.lastMessage;
                const unreadCount = conv.unreadCount || 0;

                return (
                    <div
                        key={conv.id}
                        onClick={() => setActiveConversationId(conv.id)}
                        className={`p-4 cursor-pointer hover:bg-white/5 transition-all flex items-center gap-4 relative group ${
                            activeConversationId === conv.id ? 'bg-white/5 border-r-4 border-blue-500' : ''
                        }`}
                    >
                        {/* Avatar Container */}
                        <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                                {displayAvatar ? (
                                    <SecureImage src={displayAvatar} alt={displayName} className="w-full h-full object-cover" fallbackType="profile" />
                                ) : (
                                    <span className="text-white font-bold text-lg">
                                        {displayName?.charAt(0).toUpperCase() || '?'}
                                    </span>
                                )}
                            </div>
                            {isOnline && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-gray-900 rounded-full"></span>
                            )}
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <h3 className={`text-sm font-semibold truncate ${unreadCount > 0 ? 'text-white' : 'text-gray-300'}`}>
                                    {displayName || 'Untitled Chat'}
                                </h3>
                                <span className="text-[10px] text-gray-500 font-medium">
                                    {conv.updated_at ? formatDistanceToNow(new Date(conv.updated_at), { addSuffix: false }).replace('about ', '') : ''}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs truncate flex-1 ${unreadCount > 0 ? 'text-gray-200 font-medium' : 'text-gray-500'}`}>
                                    {lastMsg ? (
                                        <>
                                            {lastMsg.sender_id === user?.id && <span className="mr-1 text-blue-500">You:</span>}
                                            {lastMsg.content}
                                        </>
                                    ) : 'No messages yet'}
                                </p>
                                
                                {unreadCount > 0 && (
                                    <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg animate-pulse">
                                        {unreadCount}
                                    </span>
                                )}

                                {lastMsg && lastMsg.sender_id === user?.id && unreadCount === 0 && (
                                    <div className="flex-shrink-0 opacity-40">
                                        {lastMsg.read_at ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Active Call Indicator */}
                        {/* {conv.activeCall && (
                            <div className="absolute top-4 right-4 animate-bounce">
                                <Phone size={14} className="text-green-500" />
                            </div>
                        )} */}
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationList;
