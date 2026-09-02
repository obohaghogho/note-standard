import React, { useMemo, startTransition, useRef, useCallback, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import type { Conversation } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Check, CheckCheck, Trash2, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePresence } from '../../context/PresenceContext';
import { useSearchParams } from 'react-router-dom';
import SecureImage from '../common/SecureImage';
import { UserBadge } from '../common/UserBadge';
import { toast } from 'react-hot-toast';

// Extracting ConversationItem and wrapping with React.memo prevents the entire list
// from re-rendering when one item changes (e.g., typing status or active state).
const ConversationItem = React.memo(({ 
    conv, 
    user, 
    isOnline, 
    isActive, 
    typingUsers,
    onClick,
    onDelete
}: { 
    conv: Conversation, 
    user: { id?: string } | null, 
    isOnline: boolean, 
    isActive: boolean, 
    typingUsers: string[],
    onClick: (id: string) => void,
    onDelete: (id: string, e: React.MouseEvent) => void
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
    const rawUnread = (conv as unknown as { unreadCount?: number; unread_count?: number }).unreadCount ?? (conv as unknown as { unread_count?: number }).unread_count ?? 0;
    const unreadCount = isActive ? 0 : Math.max(0, rawUnread);
    const typingUsersList = typingUsers;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressRef = useRef(false);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        isLongPressRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(40); } catch { /* ignore */ }
            }
            onDelete(conv.id, e as unknown as React.MouseEvent);
        }, 600);
    }, [conv.id, onDelete]);

    const handleTouchEnd = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (isLongPressRef.current) {
            e.stopPropagation();
            e.preventDefault();
            isLongPressRef.current = false;
            return;
        }
        onClick(conv.id);
    }, [conv.id, onClick]);

    return (
        <div
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            onContextMenu={(e) => {
                e.preventDefault();
                // Avoid firing context menu if long press already handled it
                if (!isLongPressRef.current) {
                    onDelete(conv.id, e);
                }
            }}
            draggable={false}
            className={`p-4 md:p-5 cursor-pointer active:bg-white/[0.04] md:hover:bg-white/[0.02] transition-all flex items-center gap-4 relative group ${
                isActive ? 'bg-white/[0.04]' : ''
            }`}
            style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
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
                    <h3 className={`text-[15px] truncate flex items-center gap-1.5 ${unreadCount > 0 ? 'text-white font-bold' : 'text-gray-200 font-normal'}`}>
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
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">
                            {conv.updated_at ? formatDistanceToNow(new Date(conv.updated_at), { addSuffix: false }).replace('about ', '') : ''}
                        </span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onDelete(conv.id, e);
                            }}
                            className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            title="Delete Conversation"
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13px] truncate flex-1 leading-relaxed ${unreadCount > 0 ? 'text-white font-semibold' : 'text-gray-400 font-normal'}`}>
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
                            {lastMsg.read_at || lastMsg.status === 'read' ? (
                                <CheckCheck size={14} className="text-blue-400 font-bold" />
                            ) : lastMsg.delivered_at || lastMsg.status === 'delivered' ? (
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

    const prevUnread = (prevProps.conv as any).unreadCount ?? (prevProps.conv as any).unread_count ?? 0;
    const nextUnread = (nextProps.conv as any).unreadCount ?? (nextProps.conv as any).unread_count ?? 0;

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
           prevUnread === nextUnread;
});

const ConversationList: React.FC = () => {
    const { conversations, activeConversationId, setActiveConversationId, deleteConversation, loading, typingUsers } = useChat();
    const { user } = useAuth();
    const { isUserOnline } = usePresence();
    const [, setSearchParams] = useSearchParams();
    const lastClickTimeRef = useRef(0);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const sortKeys = conversations.map(c =>
        `${c.id}:${c.lastMessage?.created_at ?? c.updated_at ?? ''}:${c.lastMessage?.id ?? ''}:${(c as unknown as { unreadCount?: number }).unreadCount ?? 0}:${c.lastMessage?.status ?? ''}:${c.lastMessage?.delivered_at ?? ''}:${c.lastMessage?.read_at ?? ''}`
    ).join(',');

    const sortedConversations = useMemo(() => {
        const sorted = [...conversations].sort((a, b) => {
            const timeA = new Date(a.lastMessage?.created_at || a.updated_at || 0).getTime();
            const timeB = new Date(b.lastMessage?.created_at || b.updated_at || 0).getTime();
            return timeB - timeA;
        });

        const seenDirectPeerIds = new Set<string>();
        const uniqueConversations: Conversation[] = [];

        for (const conv of sorted) {
            if (conv.type === 'direct') {
                const otherMember = conv.members?.find((m: { user_id: string; profile?: Conversation['members'][0]['profile'] }) => m.user_id !== user?.id);
                const peerId = otherMember?.user_id || otherMember?.profile?.id;

                if (peerId) {
                    if (seenDirectPeerIds.has(peerId)) {
                        continue;
                    }
                    seenDirectPeerIds.add(peerId);
                }
            }
            uniqueConversations.push(conv);
        }

        return uniqueConversations;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortKeys, user?.id]);

    const handleConversationClick = useCallback((convId: string) => {
        const now = Date.now();
        if (now - lastClickTimeRef.current < 400) return;
        lastClickTimeRef.current = now;
        startTransition(() => {
            setActiveConversationId(convId);
            setSearchParams({ id: convId });
        });
    }, [setActiveConversationId, setSearchParams]);

    const handleDeleteRequest = useCallback((convId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setPendingDeleteId(convId);
    }, []);

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        const targetId = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await deleteConversation(targetId);
            toast.success('Chat deleted');
        } catch {
            toast.error('Failed to delete chat');
        }
    };

    if (loading) return <div className="p-4 text-gray-400">Loading chats...</div>;

    if (conversations.length === 0) {
        return (
            <div className="p-8 text-center flex flex-col items-center justify-center h-full space-y-4 bg-gray-950">
                <div className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center border border-blue-500/20 shadow-lg">
                    <MessageSquare size={28} />
                </div>
                <div className="space-y-1 max-w-xs">
                    <h4 className="text-base font-bold text-white">No active conversations</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                        Start a new conversation with team members or friends to begin messaging.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-gray-950 border-r border-white/5 custom-scrollbar pb-safe relative">
            {sortedConversations.map((conv) => {
                let isOnline = false;
                
                if (conv.type === 'direct') {
                    const otherMember = conv.members.find(m => m.user_id !== user?.id);
                    if (otherMember) {
                        isOnline = isUserOnline(otherMember.user_id);
                    }
                }

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
                        onDelete={handleDeleteRequest}
                    />
                );
            })}

            {/* Quick Confirm Delete Modal */}
            {pendingDeleteId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Conversation</h3>
                        <p className="text-sm text-gray-400 mb-6">
                            Are you sure you want to delete this chat? All messages will be permanently removed for you.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPendingDeleteId(null)}
                                className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg transition-all"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConversationList;

// Stable empty array reference — prevents new array creation on every render
// for conversations with no active typing users.
const EMPTY_TYPING: string[] = [];
