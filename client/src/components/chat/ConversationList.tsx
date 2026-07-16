import React, { useMemo, startTransition, useRef, useCallback } from 'react';
import { useChat } from '../../context/ChatContext';
import type { Conversation } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Check, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePresence } from '../../context/PresenceContext';
import { useSearchParams } from 'react-router-dom';
import SecureImage from '../common/SecureImage';
import { UserBadge } from '../common/UserBadge';

// Extracting ConversationItem and wrapping with React.memo prevents the entire list
// from re-rendering when one item changes (e.g., typing status or active state).
const ConversationItem = React.memo(({ 
    conv, 
    user, 
    isOnline, 
    isActive, 
    typingUsers,
    onClick 
}: { 
    conv: Conversation, 
    user: { id?: string } | null, 
    isOnline: boolean, 
    isActive: boolean, 
    typingUsers: string[],
    onClick: (id: string) => void 
}) => {
    let displayName = conv.name;
    let displayAvatar = null;
    
    if (conv.type === 'direct') {
        const otherMember = conv.members.find((m: { user_id: string; profile?: Conversation['members'][0]['profile'] }) => m.user_id !== user?.id);
        if (otherMember && otherMember.profile) {
            const profile = otherMember.profile;
            displayName = profile.full_name || profile.username || 'Unknown User';
            displayAvatar = profile.avatar_url;
        }
    }

    const lastMsg = conv.lastMessage ?? (conv as unknown as { last_message?: typeof conv.lastMessage }).last_message;
    const unreadCount = (conv as unknown as { unreadCount?: number }).unreadCount || 0;
    const typingUsersList = typingUsers;

    return (
        <div
            onClick={() => onClick(conv.id)}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
            className={`p-4 md:p-5 cursor-pointer active:bg-white/[0.04] md:hover:bg-white/[0.02] transition-all flex items-center gap-4 relative group ${
                isActive ? 'bg-white/[0.04]' : ''
            }`}
            style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                // Suppress iOS callout (share/copy popup on long press)
                WebkitTouchCallout: 'none' as React.CSSProperties['WebkitTouchCallout'],
            }}
        >
            {/* Avatar Container */}
            <div className="relative flex-shrink-0">
                <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-white/10 flex items-center justify-center overflow-hidden shadow-xl active:scale-105 md:group-hover:scale-105 transition-transform duration-300">
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
                                planTier={conv.members.find((m: { user_id: string; profile?: Conversation['members'][0]['profile'] }) => m.user_id !== user?.id)?.profile?.plan_tier}
                                isVerified={conv.members.find((m: { user_id: string; profile?: Conversation['members'][0]['profile'] }) => m.user_id !== user?.id)?.profile?.is_verified}
                            />
                        )}
                        {typingUsersList.length > 0 && (
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
                        {typingUsersList.length > 0 ? (
                            <span className="text-blue-400 animate-pulse font-medium italic">
                                {typingUsersList.length > 1 ? 'People are typing...' : `${typingUsersList[0]} is typing...`}
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
            {isActive && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-l-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Fast surgical equality — no JSON.stringify, no object creation
    const prevTyping = prevProps.typingUsers;
    const nextTyping = nextProps.typingUsers;
    const typingEqual = prevTyping.length === nextTyping.length &&
        prevTyping.every((u, i) => u === nextTyping[i]);
    return prevProps.isActive === nextProps.isActive &&
           prevProps.isOnline === nextProps.isOnline &&
           prevProps.typingUsers === nextProps.typingUsers &&
           typingEqual &&
           prevProps.conv.updated_at === nextProps.conv.updated_at &&
           prevProps.conv.lastMessage?.id === nextProps.conv.lastMessage?.id &&
           (prevProps.conv as unknown as { last_message?: typeof prevProps.conv.lastMessage }).last_message?.id === (nextProps.conv as unknown as { last_message?: typeof nextProps.conv.lastMessage }).last_message?.id &&
           prevProps.conv.lastMessage?.status === nextProps.conv.lastMessage?.status &&
           prevProps.conv.lastMessage?.delivered_at === nextProps.conv.lastMessage?.delivered_at &&
           prevProps.conv.lastMessage?.read_at === nextProps.conv.lastMessage?.read_at &&
           (prevProps.conv as unknown as { unreadCount?: number }).unreadCount === (nextProps.conv as unknown as { unreadCount?: number }).unreadCount;
});

const ConversationList: React.FC = () => {
    const { conversations, activeConversationId, setActiveConversationId, loading, typingUsers } = useChat();
    const { user } = useAuth();
    const { isUserOnline } = usePresence();
    const [, setSearchParams] = useSearchParams();
    // Debounce guard: prevents double-navigation from rapid taps on Android.
    const lastClickTimeRef = useRef(0);

    // Phase 3 Optimization: Stable sort that only re-runs when the sort key changes.
    // The sort key is lastMessage.created_at (or updated_at), NOT read_at/delivered_at.
    // Previously, every `chat:message_read` or `chat:message_delivered` event replaced the
    // conversations array and re-triggered this sort — 10+ times/second in active chats.
    // Now the sort is only re-triggered when conversation ORDER actually changes.
    // Sort key includes: lastMessage timestamp (for ordering) + unreadCount (to force re-sort
    // when a badge changes, bubbling the conversation to the top) + lastMessage.id (for dedup
    // guard — catches canonical-message-replaces-optimistic swaps that have the same timestamp).
    const sortKeys = conversations.map(c =>
        `${c.id}:${c.lastMessage?.created_at ?? c.updated_at ?? ''}:${c.lastMessage?.id ?? ''}:${(c as unknown as { unreadCount?: number }).unreadCount ?? 0}:${c.lastMessage?.status ?? ''}:${c.lastMessage?.delivered_at ?? ''}:${c.lastMessage?.read_at ?? ''}`
    ).join(',');

    const sortedConversations = useMemo(() => {
        return [...conversations].sort((a, b) => {
            const timeA = new Date(a.lastMessage?.created_at || a.updated_at || 0).getTime();
            const timeB = new Date(b.lastMessage?.created_at || b.updated_at || 0).getTime();
            return timeB - timeA;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortKeys]);

    const handleConversationClick = useCallback((convId: string) => {
        const now = Date.now();
        // 400ms debounce — prevents double-tap and rapid repeated navigation.
        if (now - lastClickTimeRef.current < 400) return;
        lastClickTimeRef.current = now;
        // startTransition keeps UI responsive during the React Router transition.
        startTransition(() => {
            setActiveConversationId(convId);
            setSearchParams({ id: convId });
        });
    }, [setActiveConversationId, setSearchParams]);

    if (loading) return <div className="p-4 text-gray-400">Loading chats...</div>;

    if (conversations.length === 0) {
        return <div className="p-4 text-gray-500">No conversations yet.</div>;
    }

    return (
        <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-gray-950 border-r border-white/5 custom-scrollbar pb-safe">
            {sortedConversations.map((conv) => {
                let isOnline = false;
                
                if (conv.type === 'direct') {
                    const otherMember = conv.members.find(m => m.user_id !== user?.id);
                    if (otherMember) {
                        isOnline = isUserOnline(otherMember.user_id);
                    }
                }

                // Pass typingUsers as a separate stable prop — avoids creating
                // a new `conv` object on every render which defeats React.memo.
                const convTypingUsers = typingUsers[conv.id] || EMPTY_TYPING;
                return (
                    <ConversationItem
                        key={conv.id}
                        conv={conv}
                        user={user}
                        isOnline={isOnline}
                        isActive={activeConversationId === conv.id}
                        typingUsers={convTypingUsers}
                        onClick={handleConversationClick}
                    />
                );
            })}
        </div>
    );
};

export default ConversationList;

// Stable empty array reference — prevents new array creation on every render
// for conversations with no active typing users.
const EMPTY_TYPING: string[] = [];
