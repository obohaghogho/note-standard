import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Check, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePresence } from '../../context/PresenceContext';
import SecureImage from '../common/SecureImage';
import { UserBadge } from '../common/UserBadge';

const ConversationList: React.FC = () => {
    const { conversations, activeConversationId, setActiveConversationId, loading, typingUsers } = useChat();
    const { user } = useAuth();
    const { isUserOnline } = usePresence();

    if (loading) return <div className="p-4 text-gray-400">Loading chats...</div>;

    if (conversations.length === 0) {
        return <div className="p-4 text-gray-500">No conversations yet.</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-950 border-r border-white/5 scrollbar-hide pb-safe">
            {conversations.map((conv) => {
                let displayName = conv.name;
                let displayAvatar = null;
                let isOnline = false;
                
                if (conv.type === 'direct') {
                    const otherMember = conv.members.find(m => m.user_id !== user?.id);
                    if (otherMember && otherMember.profile) {
                        const profile = otherMember.profile;
                        displayName = profile.full_name || profile.username || 'Unknown User';
                        displayAvatar = profile.avatar_url;
                        isOnline = isUserOnline(otherMember.user_id);
                    }
                }

                const lastMsg = conv.lastMessage;
                const unreadCount = conv.unreadCount || 0;

                return (
                    <div
                        key={conv.id}
                        onClick={() => setActiveConversationId(conv.id)}
                        className={`p-4 md:p-5 cursor-pointer hover:bg-white/[0.02] transition-all flex items-center gap-4 relative group ${
                            activeConversationId === conv.id ? 'bg-white/[0.04]' : ''
                        }`}
                    >
                        {/* Avatar Container */}
                        <div className="relative flex-shrink-0">
                            <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-white/10 flex items-center justify-center overflow-hidden shadow-xl group-hover:scale-105 transition-transform duration-300">
                                {displayAvatar ? (
                                    <SecureImage src={displayAvatar} alt={displayName} className="w-full h-full object-cover" fallbackType="profile" />
                                ) : (
                                    <span className="text-white font-bold text-xl">
                                        {displayName?.charAt(0).toUpperCase() || '?'}
                                    </span>
                                )}
                            </div>
                            {isOnline && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-[3px] border-gray-950 rounded-full shadow-lg"></span>
                            )}
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-0.5">
                                <h3 className={`text-[15px] font-bold truncate flex items-center gap-1.5 ${unreadCount > 0 ? 'text-white' : 'text-gray-200'}`}>
                                    {displayName || 'Untitled Chat'}
                                    {conv.type === 'direct' && (
                                        <UserBadge 
                                            planTier={conv.members.find(m => m.user_id !== user?.id)?.profile?.plan_tier}
                                            isVerified={conv.members.find(m => m.user_id !== user?.id)?.profile?.is_verified}
                                        />
                                    )}
                                    {typingUsers[conv.id]?.length > 0 && (
                                        <span className="flex gap-0.5 ml-1">
                                            <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></span>
                                            <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                            <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                        </span>
                                    )}
                                </h3>
                                <span className="text-[11px] text-gray-500 font-bold uppercase tracking-tight ml-2">
                                    {conv.updated_at ? formatDistanceToNow(new Date(conv.updated_at), { addSuffix: false }).replace('about ', '') : ''}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <p className={`text-[13px] truncate flex-1 leading-relaxed ${unreadCount > 0 ? 'text-gray-100 font-semibold' : 'text-gray-500'}`}>
                                    {typingUsers[conv.id]?.length > 0 ? (
                                        <span className="text-blue-400 animate-pulse font-medium italic">
                                            {typingUsers[conv.id].length > 1 ? 'People are typing...' : `${typingUsers[conv.id][0]} is typing...`}
                                        </span>
                                    ) : lastMsg ? (
                                        <>
                                            {lastMsg.sender_id === user?.id && <span className="mr-1 text-blue-500 font-medium">You:</span>}
                                            <span>{lastMsg.content}</span>
                                        </>
                                    ) : (
                                        <span className="opacity-40 font-medium">No messages yet</span>
                                    )}
                                </p>
                                
                                {unreadCount > 0 && (
                                    <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-blue-900/40 animate-in zoom-in-0 duration-300">
                                        {unreadCount}
                                    </span>
                                )}

                                {lastMsg && lastMsg.sender_id === user?.id && (
                                    <div className="flex-shrink-0 opacity-60 scale-75">
                                        {lastMsg.read_at ? (
                                            <CheckCheck size={14} className="text-blue-400 font-bold" />
                                        ) : lastMsg.delivered_at ? (
                                            <CheckCheck size={14} className="text-gray-400" />
                                        ) : (
                                            <Check size={14} className="text-gray-500" />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Selection Indicator (Active State) */}
                        {activeConversationId === conv.id && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-l-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationList;
