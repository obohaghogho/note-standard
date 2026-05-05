import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { NotificationService } from '../services/NotificationService';
import { API_URL } from '../lib/api';
import toast from 'react-hot-toast';

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    type: 'text' | 'image' | 'video' | 'file' | 'audio' | 'call';
    isOwn?: boolean;
    original_language?: string;
    read_at?: string;
    delivered_at?: string;
    is_edited?: boolean;
    updated_at?: string;
    sentiment?: {
        label: 'positive' | 'negative' | 'neutral';
        score: number;
    };
    attachment?: {
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        storage_path: string;
        metadata: Record<string, unknown>;
    };
}

export interface Conversation {
    id: string;
    type: 'direct' | 'group';
    chat_type?: 'support' | 'general' | 'admin';
    support_status?: 'open' | 'pending' | 'resolved' | 'escalated';
    name: string;
    updated_at: string;
    lastMessage?: {
        content: string;
        sender_id: string;
        created_at: string;
        read_at?: string;
        delivered_at?: string;
    };
    unreadCount?: number;
    is_muted?: boolean;
    members: {
        user_id: string;
        role: string;
        status: string;
        profile?: {
            username: string;
            full_name: string;
            avatar_url: string;
            is_online?: boolean;
            plan_tier?: 'free' | 'pro' | 'team' | 'business' | 'enterprise';
            is_verified?: boolean;
            show_online_status?: boolean;
            last_seen?: string;
        };
    }[];
}

export interface ChatContextValue {
    conversations: Conversation[];
    messages: Record<string, Message[]>;
    activeConversationId: string | null;
    loading: boolean;
    connected: boolean;
    setActiveConversationId: (id: string | null) => void;
    sendMessage: (content: string, type?: string, attachmentId?: string) => Promise<void>;
    loadMoreMessages: (conversationId: string) => Promise<void>;
    markMessageRead: (messageId: string) => Promise<void>;
    markMessageDelivered: (messageId: string) => Promise<void>;
    startConversation: (username: string) => Promise<void>; 
    acceptConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    deleteMessage: (messageId: string) => Promise<void>;
    editMessage: (messageId: string, content: string) => Promise<void>;
    muteConversation: (id: string, isMuted: boolean) => Promise<void>;
    clearChatHistory: (id: string) => Promise<void>;
    sendTypingStatus: (isTyping: boolean) => void;
    typingUsers: Record<string, string[]>;
    drafts: Record<string, string>;
    setDraft: (conversationId: string, content: string) => void;
    hasMore: Record<string, boolean>;
    sendMessageToConversation: (conversationId: string, content: string, type?: string, attachmentId?: string) => Promise<void>;
    markConversationRead: (conversationId: string) => Promise<void>;
    markConversationDelivered: (conversationId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) throw new Error('useChat must be used within a ChatProvider');
    return context;
};

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, profile, session, authReady, isSwitching } = useAuth();
    const { socket, connected } = useSocket();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
    const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const isMounted = useRef(true);
    const conversationsFetchRef = useRef(false);
    const hasInitialFetched = useRef(false);
    const conversationsRef = useRef<Conversation[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const activeConversationIdRef = useRef<string | null>(null);
    const isFetchingMoreRef = useRef<Record<string, boolean>>({});
    const lastUserIdRef = useRef<string | null>(null);


    // Keep refs in sync
    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);


    const markMessageRead = useCallback(async (messageId: string) => {
        if (!session) return;
        try {
            await fetch(`${API_URL}/api/chat/messages/${messageId}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
        } catch (err) {
            console.error('[Chat] Failed to mark read:', err);
        }
    }, [session]);

    const markMessageDelivered = useCallback(async (messageId: string) => {
        if (!session) return;
        try {
            await fetch(`${API_URL}/api/chat/messages/${messageId}/deliver`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
        } catch (err) {
            console.error('[Chat] Failed to mark delivered:', err);
        }
    }, [session]);

    const markConversationDelivered = useCallback(async (conversationId: string) => {
        if (!session) return;
        try {
            await fetch(`${API_URL}/api/chat/conversations/${conversationId}/deliver`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            // Optimistic local update
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.sender_id !== user?.id ? { ...m, delivered_at: m.delivered_at || new Date().toISOString() } : m)
                };
            });
        } catch (err) {
            console.error('[Chat] Failed to mark conversation delivered:', err);
        }
    }, [session, user?.id]);

    const markConversationRead = useCallback(async (conversationId: string) => {
        if (!session) return;
        try {
            await fetch(`${API_URL}/api/chat/conversations/${conversationId}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            // Optimistic local update
            
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.sender_id !== user?.id ? { ...m, read_at: m.read_at || new Date().toISOString() } : m)
                };
            });

            setConversations(prev => prev.map(conv => {
                if (conv.id === conversationId) {
                    return { ...conv, unreadCount: 0 };
                }
                return conv;
            }));
        } catch (err) {
            console.error('[Chat] Failed to mark conversation read:', err);
        }
    }, [session, user?.id]);

    const joinAllRooms = useCallback((convList: Conversation[]) => {
        const s = socketRef.current;
        if (!s || !s.connected || convList.length === 0) return;
        console.log('[Chat] Joining', convList.length, 'rooms');
        convList.forEach(conv => s.emit('join_room', conv.id));
    }, []);

    const loadConversations = useCallback(async () => {
        // Rule 7 & 12: Remove profile identity check. Respect isSwitching.
        if (!session || isSwitching || conversationsFetchRef.current) return;
        
        conversationsFetchRef.current = true;
        
        try {
            console.log('[Chat] FETCH: Loading conversations', { userId: user?.id });
            const res = await fetch(`${API_URL}/api/chat/conversations`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            
            if (!res.ok) throw new Error(`Failed to load conversations: ${res.status}`);
            
            const data = await res.json();
            
            if (isMounted.current) {
                // Map backend last_message object to lastMessage
                const mappedData = data.map((conv: Conversation & { last_message?: Conversation['lastMessage'] }) => ({
                    ...conv,
                    lastMessage: conv.last_message 
                }));
                setConversations(mappedData);
                setLoading(false);
                // ✅ Join rooms immediately after conversations load
                joinAllRooms(mappedData);
                
                // Mark all unread conversations as delivered (since we just loaded them)
                mappedData.forEach((conv: Conversation) => {
                    if (conv.unreadCount && conv.unreadCount > 0) {
                        markConversationDelivered(conv.id);
                    }
                });
            }
        } catch (e) {
            console.error('[Chat] Failed to load conversations:', e);
            if (isMounted.current) setLoading(false);
        } finally {
            conversationsFetchRef.current = false;
        }
    }, [session, user, isSwitching, joinAllRooms, markConversationDelivered]);

    // Initial load / Identity Switch Reset
    useEffect(() => {
        if (!authReady) return;
        
        isMounted.current = true;
        
        // If we have a session but haven't fetched OR if the identity has changed
        if (session && user) {
            // ONLY wipe data if the User ID has actually changed to prevent "wipe-on-refresh"
            if (lastUserIdRef.current !== user.id) {
                console.log(`[Chat] Identity change detected: ${user.id} (was ${lastUserIdRef.current})`);
                
                // Clear old data immediately to prevent identity leaks
                setConversations([]);
                setMessages({});
                setLoading(true);
                hasInitialFetched.current = true;
                lastUserIdRef.current = user.id;
                
                loadConversations();
            } else {
                // Same user, just a session update/refresh. 
                // We DON'T wipe state, but we might want to refresh conversations list in background
                console.log(`[Chat] Session refresh for same user: ${user.id}`);
                loadConversations();
            }
        } else if (!session) {
            setConversations([]);
            setMessages({});
            setLoading(false);
            hasInitialFetched.current = false;
            lastUserIdRef.current = null;
        }

        return () => { 
            isMounted.current = false; 
        };
    }, [authReady, session, user, loadConversations]);

    // Socket listeners
    useEffect(() => {
        if (!socket || !connected) return;

        const processIncomingMessage = (msg: Message & { sender_id: string; conversation_id: string }) => {
            console.log('Realtime event received:', { event: 'chat:message', id: msg.id, conversation_id: msg.conversation_id });
            console.log('[DEBUG] 📨 Socket received msg:', msg.id, 'for room:', msg.conversation_id, 'isMounted:', isMounted.current);
            if (!isMounted.current) return;
            
            const newMessage: Message = { ...msg, isOwn: msg.sender_id === user?.id };
            
            if (msg.sender_id !== user?.id) {
                const sender = conversationsRef.current.find(c => c.id === msg.conversation_id)?.members.find(m => m.user_id === msg.sender_id)?.profile?.username || 'Someone';
                NotificationService.notifyNewMessage(sender, msg.content, msg.conversation_id);
                
                // Show in-app toast if document is visible but not in this specific chat
                const isActiveChat = activeConversationIdRef.current && 
                                    msg.conversation_id && 
                                    activeConversationIdRef.current.toString().toLowerCase() === msg.conversation_id.toString().toLowerCase();

                const isChatPage = window.location.pathname.includes('/chat');

                if (document.visibilityState === 'visible' && !isActiveChat && !isChatPage) {
                    toast.custom((t) => (
                        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-gray-900 shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-white/10 border border-gray-800`}>
                            <div className="flex-1 w-0 p-4">
                                <div className="flex items-start">
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-bold text-white">
                                            {sender}
                                        </p>
                                        <p className="mt-1 text-sm text-gray-400 truncate">
                                            {msg.content}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex border-l border-gray-800">
                                <button
                                    onClick={() => {
                                        setActiveConversationId(msg.conversation_id);
                                        toast.dismiss(t.id);
                                    }}
                                    className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-bold text-blue-500 hover:text-blue-400 focus:outline-none"
                                >
                                    View
                                </button>
                            </div>
                        </div>
                    ), { duration: 4000, position: 'top-right' });
                }
            }

            setMessages(prev => {
                const current = prev[msg.conversation_id] || [];
                // Check if uuid exists to prevent socket double-delivery
                if (current.some(m => m.id === msg.id && m.content === msg.content)) {
                    return prev;
                }

                // If optimism matched
                const now = new Date(msg.created_at).getTime();
                const optimisticMatchIndex = current.findIndex(m => 
                    m.id.startsWith('temp-') && 
                    m.sender_id === msg.sender_id && 
                    m.type === msg.type &&
                    m.content === msg.content &&
                    Math.abs(now - new Date(m.created_at).getTime()) < 10000
                );

                let nextMessages;
                if (optimisticMatchIndex !== -1) {
                    nextMessages = [...current];
                    nextMessages[optimisticMatchIndex] = newMessage;
                } else {
                    nextMessages = [...current, newMessage];
                }

                return { ...prev, [msg.conversation_id]: nextMessages };
            });

            setConversations(prev => prev.map(conv => {
                if (conv.id === msg.conversation_id) {
                    const isOtherMsg = msg.sender_id !== user?.id;
                    const isActive = msg.conversation_id === activeConversationIdRef.current;
                    return {
                        ...conv,
                        updated_at: msg.created_at,
                        lastMessage: { content: msg.content, sender_id: msg.sender_id, created_at: msg.created_at, delivered_at: msg.delivered_at, read_at: msg.read_at },
                        unreadCount: (conv.unreadCount || 0) + (isOtherMsg && !isActive ? 1 : 0)
                    };
                }
                return conv;
            }));

            if (msg.conversation_id === activeConversationIdRef.current && msg.sender_id !== user?.id) {
                markMessageRead(msg.id);
            } else if (msg.sender_id !== user?.id) {
                // If not active window but received, it's delivered
                markMessageDelivered(msg.id);
            }
        };

        const onMessageRead = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
            
            setMessages(prev => {
                const convMessages = prev[conversationId] || [];
                // If message already marked read later, don't overwrite with older timestamp
                return {
                    ...prev,
                    [conversationId]: convMessages.map(m => 
                        m.id === messageId ? { ...m, read_at: m.read_at || new Date().toISOString() } : m
                    )
                };
            });

            // Also update the unread count if we just read the last message
            setConversations(prev => prev.map(conv => {
                if (conv.id === conversationId && conv.lastMessage) {
                    return {
                        ...conv,
                        unreadCount: Math.max(0, (conv.unreadCount || 0) - 1),
                        lastMessage: { 
                            ...conv.lastMessage, 
                            read_at: new Date().toISOString() 
                        }
                    };
                }
                return conv;
            }));
        };

        const onMessageDelivered = ({ messageId, conversationId, delivered_at }: { messageId: string; conversationId: string, delivered_at?: string }) => {
            setMessages(prev => {
                const convMessages = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: convMessages.map(m => 
                        m.id === messageId ? { ...m, delivered_at: m.delivered_at || delivered_at || new Date().toISOString() } : m
                    )
                };
            });

            // Update conversation last message delivered status
            setConversations(prev => prev.map(conv => {
                if (conv.id === conversationId && conv.lastMessage && (conv.lastMessage as { id?: string }).id === messageId) {
                    return {
                        ...conv,
                        lastMessage: {
                            ...conv.lastMessage,
                            delivered_at: delivered_at || new Date().toISOString()
                        }
                    };
                }
                return conv;
            }));
        };

        const onNewConversation = (newConv?: { id?: string; conversationId?: string }) => {
            loadConversations();
            const id = newConv?.id || newConv?.conversationId;
            if (id && socket && connected) {
                socket.emit('join_room', id);
            }
        };

        const onConversationDeleted = ({ conversationId }: { conversationId: string }) => {
            setConversations(prev => prev.filter(c => c.id !== conversationId));
            if (activeConversationIdRef.current === conversationId) {
                setActiveConversationId(null);
            }
            // Cleanup messages
            
            setMessages(prev => {
                const next = { ...prev };
                delete next[conversationId];
                return next;
            });
        };

        socket.on('chat:message', processIncomingMessage);
        socket.on('chat:new_conversation', onNewConversation);
        socket.on('chat:conversation_updated', onNewConversation);
        socket.on('chat:message_read', onMessageRead);
        socket.on('chat:message_delivered', onMessageDelivered);
        socket.on('chat:typing', ({ conversationId, userId, username, isTyping }: { conversationId: string, userId: string, username: string, isTyping?: boolean }) => {
            if (userId === user?.id) return;
            setTypingUsers(prev => {
                const current = prev[conversationId] || [];
                // If isTyping is explicitly provided (from backend/gateway normalization)
                const shouldBeTyping = isTyping !== undefined ? isTyping : true; 
                
                if (shouldBeTyping) {
                    if (current.includes(username)) return prev;
                    return { ...prev, [conversationId]: [...current, username] };
                } else {
                    return { ...prev, [conversationId]: current.filter(u => u !== username) };
                }
            });
        });
        
        socket.on('chat:conversation_read', ({ conversationId, readerId, readAt }: { conversationId: string, readerId: string, readAt: string }) => {
            if (readerId === user?.id) return; // Already updated locally
            
            
            setMessages(prev => {
                const convMessages = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: convMessages.map(m => 
                        m.sender_id === user?.id ? { ...m, read_at: m.read_at || readAt } : m
                    )
                };
            });
        });
        // ── Deletion & Edit handlers (use BOTH prefixed and unprefixed for compatibility) ──
        const onMessageDeleted = ({ messageId, conversationId }: { messageId: string, conversationId: string }) => {
            console.log('[Chat] Realtime event received: message_deleted', { messageId, conversationId });
            setMessages(prev => {
                const convMessages = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: convMessages.filter(m => m.id !== messageId)
                };
            });

            setConversations(prev => prev.map(conv => {
                if (conv.id === conversationId && conv.lastMessage && (conv.lastMessage as { id?: string }).id === messageId) {
                    return { ...conv, lastMessage: undefined };
                }
                return conv;
            }));
        };

        const onMessageEdited = (editedMsg: Message) => {
            if (!editedMsg || !editedMsg.id) return;
            const conversationId = editedMsg.conversation_id;
            console.log('[Chat] Realtime event received: message_edited', { messageId: editedMsg.id, conversationId });
            
            setMessages(prev => {
                const convMessages = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: convMessages.map(m => m.id === editedMsg.id ? { ...m, content: editedMsg.content, is_edited: true, updated_at: editedMsg.updated_at } : m)
                };
            });

            setConversations(prev => prev.map(conv => {
                if (conv.id === conversationId && conv.lastMessage && (conv.lastMessage as { sender_id?: string }).sender_id === editedMsg.sender_id) {
                    if (conv.lastMessage.created_at === editedMsg.created_at) {
                        return { ...conv, lastMessage: { ...conv.lastMessage, content: editedMsg.content } };
                    }
                }
                return conv;
            }));
        };

        // Register with chat: prefix (server emits these)
        socket.on('chat:conversation_deleted', onConversationDeleted);
        socket.on('chat:message_deleted', onMessageDeleted);
        socket.on('chat:message_edited', onMessageEdited);
        // Also register unprefixed for backward compatibility
        socket.on('conversation_deleted', onConversationDeleted);
        socket.on('message_deleted', onMessageDeleted);
        socket.on('message_edited', onMessageEdited);


        return () => {
            socket.off('chat:message', processIncomingMessage);
            socket.off('chat:new_conversation', onNewConversation);
            socket.off('chat:conversation_updated', onNewConversation);
            socket.off('chat:message_read', onMessageRead);
            socket.off('chat:message_delivered', onMessageDelivered);
            socket.off('chat:typing');
            socket.off('chat:conversation_read');
            socket.off('chat:conversation_deleted', onConversationDeleted);
            socket.off('chat:message_deleted', onMessageDeleted);
            socket.off('chat:message_edited', onMessageEdited);
            // Also clean up unprefixed listeners
            socket.off('conversation_deleted', onConversationDeleted);
            socket.off('message_deleted', onMessageDeleted);
            socket.off('message_edited', onMessageEdited);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected, user?.id, loadConversations]);


    // ✅ Re-join all rooms whenever socket reconnects (covers disconnect/reconnect scenarios)
    useEffect(() => {
        if (!socket) return;
        const onConnect = () => {
            console.log('[Chat] Socket (re)connected — rejoining', conversationsRef.current.length, 'rooms');
            joinAllRooms(conversationsRef.current);
        };
        socket.on('connect', onConnect);
        // Also join immediately if already connected (e.g., conversations loaded after connect)
        if (connected && conversationsRef.current.length > 0) {
            joinAllRooms(conversationsRef.current);
        }
        return () => {
            socket.off('connect', onConnect);
        };
    }, [socket, connected, joinAllRooms]);


    useEffect(() => {
        if (!socket) return;
        const onAny = (event: string, ...args: unknown[]) => {
            console.log(`[Chat] 📡 Socket event: ${event}`, args);
        };
        socket.onAny(onAny);
        return () => {
            socket.offAny(onAny);
        };
    }, [socket]);


    const sendMessage = async (content: string, type: string = 'text', attachmentId?: string) => {
        if (!activeConversationId) throw new Error('No active conversation');
        return sendMessageToConversation(activeConversationId, content, type, attachmentId);
    };

    const sendMessageToConversation = async (conversationId: string, content: string, type: string = 'text', attachmentId?: string) => {
        if (!session || !user) throw new Error('Cannot send message');
        
        // ── Optimistic Update ────────────────────────────────────
        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            created_at: new Date().toISOString(),
            type: type as Message['type'],
            isOwn: true,
            attachment: attachmentId ? { id: attachmentId, file_name: 'File', file_type: '', file_size: 0, storage_path: '', metadata: {} } : undefined
        };

        setMessages(prev => ({
            ...prev,
            [conversationId]: [...(prev[conversationId] || []), optimisticMessage]
        }));

        // Update conversation last message preview
        setConversations(prev => prev.map(conv => {
            if (conv.id === conversationId) {
                return {
                    ...conv,
                    lastMessage: {
                        content,
                        sender_id: user.id,
                        created_at: optimisticMessage.created_at
                    }
                };
            }
            return conv;
        }));

        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ content, type, attachmentId })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: 'Failed to send message' }));
                throw new Error(error.error || 'Failed to send message');
            }

            const data = await res.json();
            
            // Replace optimistic message with real one
            
            setMessages(prev => {
                const current = prev[conversationId] || [];
                // CRITICAL: Check if the message was already added by a socket event (receive_message)
                const alreadyExists = current.some(m => m.id === data.id);
                
                if (alreadyExists) {
                    // Just remove the temporary optimistic message
                    return {
                        ...prev,
                        [conversationId]: current.filter(m => m.id !== tempId)
                    };
                }

                // Otherwise, swap tempId with real data
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === tempId ? {
                        ...m,
                        id: data.id,
                        created_at: data.created_at,
                        original_language: data.original_language,
                        attachment: data.attachment,
                        read_at: data.read_at
                    } : m)
                };
            });
        } catch (err) {
            // Rollback on failure
            setMessages(prev => ({
                ...prev,
                [conversationId]: (prev[conversationId] || []).filter(m => m.id !== tempId)
            }));
            throw err;
        }
    };

    const sendTypingStatus = useCallback((isTyping: boolean) => {
        if (!socket || !connected || !activeConversationId || !user) return;
        // We still use the legacy 'typing'/'stop_typing' bridge for direct gateway-to-client speed
        // but the gateway will broadcast 'chat:typing'
        const event = isTyping ? 'typing' : 'stop_typing';
        socket.emit(event, { 
            conversationId: activeConversationId, 
            userId: user.id,
            username: profile?.username || 'User'
        });
    }, [socket, connected, activeConversationId, user, profile?.username]);

    const setDraft = useCallback((conversationId: string, content: string) => {
        setDrafts(prev => ({ ...prev, [conversationId]: content }));
    }, []);

    const loadMoreMessages = async (conversationId: string) => {
        if (isFetchingMoreRef.current[conversationId]) return;

        const currentM = messages[conversationId] || [];
        if (currentM.length === 0 || !session) return;

        isFetchingMoreRef.current[conversationId] = true;
        const oldest = currentM[0].created_at;
        
        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages?before=${oldest}&limit=30`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                
                const messageList: Message[] = data.map((msg: Message) => {
                    return {
                        ...msg,
                        isOwn: msg.sender_id === user?.id
                    };
                });

                if (data.length < 30) {
                    setHasMore(prev => ({ ...prev, [conversationId]: false }));
                } else {
                    setHasMore(prev => ({ ...prev, [conversationId]: true }));
                }
                
                setMessages(prev => {
                    const existing = prev[conversationId] || [];
                    // Deduplicate
                    const existingIds = new Set(existing.map(m => m.id));
                    const newMessages = messageList.filter(m => !existingIds.has(m.id));
                    
                    return {
                        ...prev,
                        [conversationId]: [...newMessages, ...existing]
                    };
                });
            }
        } catch (err) {
            console.error('[Chat] Load more failed:', err);
        } finally {
            isFetchingMoreRef.current[conversationId] = false;
        }
    };


    const startConversation = async (username: string) => {
        if (!user || !session) throw new Error('Must be logged in');

        const res = await fetch(`${API_URL}/api/chat/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                type: 'direct',
                name: username,
                participants: [username]
            })
        });

        if (res.ok) {
            const data = await res.json();
            if (socket && connected) {
                socket.emit('join_room', data.conversation.id);
            }
            await loadConversations();
            setActiveConversationId(data.conversation.id);
            return data.conversation.id;
        } else {
            const err = await res.json();
            throw new Error(err.error || 'Failed to start chat');
        }
    };

    const acceptConversation = async (conversationId: string) => {
        if (!session) throw new Error('No session');
        
        try {
            // Optimistic update
            setConversations(prev => prev.map(c => 
                c.id === conversationId 
                ? { 
                    ...c, 
                    members: c.members.map(m => m.user_id === user?.id ? { ...m, status: 'accepted' } : m) 
                  } 
                : c
            ));

            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/accept`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (res.ok) {
                // Refresh to get full server state
                loadConversations();
            } else {
                // Rollback
                loadConversations();
                throw new Error('Failed to accept conversation');
            }
        } catch (err) {
            console.error('[Chat] Failed to accept conversation:', err);
            loadConversations(); // Rollback/Sync
            throw err;
        }
    };

    const deleteConversation = async (conversationId: string) => {
        if (!session) throw new Error('No session');

        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                // The socket listener 'conversation_deleted' will handle state update for everyone
                // but we can proactively clear it for the deleting user too.
                setConversations(prev => prev.filter(c => c.id !== conversationId));
                if (activeConversationId === conversationId) {
                    setActiveConversationId(null);
                }
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete conversation');
            }
        } catch (err) {
            console.error('[Chat] Failed to delete conversation:', err);
            throw err;
        }
    };

    const deleteMessage = async (messageId: string) => {
        if (!session || !activeConversationId) throw new Error('No session or active chat');

        // Capture message for rollback
        const currentMessages = messages[activeConversationId] || [];
        const messageToRestore = currentMessages.find(m => m.id === messageId);
        
        if (!messageToRestore) return; // Already deleted or not found

        // Optimistic update
        setMessages(prev => ({
            ...prev,
            [activeConversationId]: (prev[activeConversationId] || []).filter(m => m.id !== messageId)
        }));

        // Update conversation last message optimistically
        setConversations(prev => prev.map(conv => {
            if (conv.id === activeConversationId && conv.lastMessage && (conv.lastMessage as { id?: string }).id === messageId) {
                return { ...conv, lastMessage: undefined };
            }
            return conv;
        }));

        try {
            const res = await fetch(`${API_URL}/api/chat/messages/${messageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete message');
            }
        } catch (err) {
            // Rollback
            
            setMessages(prev => {
                const existing = prev[activeConversationId] || [];
                if (existing.some(m => m.id === messageId)) return prev; // Already back somehow
                
                return {
                    ...prev,
                    [activeConversationId]: [...existing, messageToRestore]
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                };
            });
            
            console.error('[Chat] Failed to delete message:', err);
            // Show toast if possible, though context doesn't have it, ChatWindow docs show toast usage.
            // We'll rely on the caller to handle the error or toast from there.
            throw err;
        }
    };

    const editMessage = async (messageId: string, content: string) => {
        if (!session || !activeConversationId) throw new Error('No session or active chat');

        // Optimistic update
        let oldMessageContent = '';
        
            setMessages(prev => {
            const current = prev[activeConversationId] || [];
            const msg = current.find(m => m.id === messageId);
            if (msg) oldMessageContent = msg.content;
            
            return {
                ...prev,
                [activeConversationId]: current.map(m => m.id === messageId ? { ...m, content, is_edited: true } : m)
            };
        });

        // Update conversation last message optimistically
        setConversations(prev => prev.map(conv => {
            if (conv.id === activeConversationId && conv.lastMessage && (conv.lastMessage as { id?: string }).id === messageId) {
                 // Or by checking created_at
                 return { ...conv, lastMessage: { ...conv.lastMessage, content } };
            }
            return conv;
        }));

        try {
            const res = await fetch(`${API_URL}/api/chat/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to edit message');
            }
        } catch (err) {
            // Rollback
            if (oldMessageContent) {
                
            setMessages(prev => {
                    const current = prev[activeConversationId] || [];
                    return {
                        ...prev,
                        [activeConversationId]: current.map(m => m.id === messageId ? { ...m, content: oldMessageContent, is_edited: false } : m)
                    };
                });
            }
            console.error('[Chat] Failed to edit message:', err);
            throw err;
        }
    };

    const muteConversation = async (conversationId: string, isMuted: boolean) => {
        if (!session) throw new Error('No session');

        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/mute`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isMuted })
            });

            if (res.ok) {
                setConversations(prev => prev.map(c => 
                    c.id === conversationId ? { ...c, is_muted: isMuted } : c
                ));
            } else {
                throw new Error('Failed to mute conversation');
            }
        } catch (err) {
            console.error('[Chat] Failed to mute conversation:', err);
            throw err;
        }
    };

    const clearChatHistory = async (conversationId: string) => {
        if (!session) throw new Error('No session');

        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                setMessages(prev => ({
                    ...prev,
                    [conversationId]: []
                }));
                // Reset pagination
                setHasMore(prev => ({ ...prev, [conversationId]: false }));
            } else {
                throw new Error('Failed to clear chat history');
            }
        } catch (err) {
            console.error('[Chat] Failed to clear chat history:', err);
            throw err;
        }
    };

    const fetchActiveMessages = useCallback(async (convId: string) => {
        if (!convId || !session) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${convId}/messages`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store'
            });
            
            if (!res.ok) return;
            
            const rawMessages = await res.json();
            if (!isMounted.current) return;

            const now = new Date().toISOString();
            let hasUnread = false;

            const messageList: Message[] = rawMessages.map((msg: Message) => {
                const isUnread = !msg.read_at && msg.sender_id !== user?.id;
                if (isUnread) hasUnread = true;
                return {
                    ...msg,
                    isOwn: msg.sender_id === user?.id,
                    read_at: isUnread ? now : msg.read_at
                };
            });

            setMessages(prev => {
                const existing = prev[convId] || [];
                if (messageList.length === 0) return { ...prev, [convId]: existing };

                const fetchedDates = messageList.map(m => new Date(m.created_at).getTime());
                const oldestFetchedDate = Math.min(...fetchedDates);

                // Keep existing messages that are older than the oldest fetched message
                // This preserves chat history when returning to the app
                const olderExisting = existing.filter(m => new Date(m.created_at).getTime() < oldestFetchedDate);
                
                // Keep any optimistic messages
                const optimisticMessages = existing.filter(m => m.id.startsWith('temp-'));

                const mergedMap = new Map<string, Message>();
                
                olderExisting.forEach(m => mergedMap.set(m.id, m));
                messageList.forEach(m => mergedMap.set(m.id, m));
                optimisticMessages.forEach(m => mergedMap.set(m.id, m));

                return { 
                    ...prev, 
                    [convId]: Array.from(mergedMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) 
                };
            });
            
            // Adjust hasMore logic if we fetched a full page, but keep true if we already had hasMore = true
            setHasMore(prev => ({ ...prev, [convId]: prev[convId] || rawMessages.length >= 50 }));

            if (hasUnread) {
                markConversationRead(convId);
            }
        } catch (err) {
            console.error('[Chat] Failed to fetch messages:', err);
        }
    }, [session, user?.id, markConversationRead]);

    useEffect(() => {
        if (activeConversationId) {
            fetchActiveMessages(activeConversationId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConversationId, session?.access_token, user?.id]);

    // ✅ Mobile PWA rapid-sync on foreground (fixes lost sockets when device is locked)
    useEffect(() => {
        let syncTimeout: ReturnType<typeof setTimeout>;

        const handleForegroundSync = () => {
            // Debounce to prevent multiple fires from visibilitychange + focus
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => {
                if (document.visibilityState === 'visible') {
                    console.log('[Chat] App resumed from background. Syncing...');
                    
                    if (socketRef.current) {
                        // On iOS Safari, sockets become zombies when backgrounded.
                        // Force a clean reconnect if it's been paused to ensure real-time events work.
                        if (socketRef.current.disconnected) {
                            socketRef.current.connect();
                        } else {
                            // Even if it thinks it's connected, the underlying TCP might be dead.
                            // We trigger a manual disconnect and reconnect to be completely safe on iOS.
                            socketRef.current.disconnect();
                            setTimeout(() => socketRef.current?.connect(), 100);
                        }
                    }
                    
                    loadConversations();
                    if (activeConversationIdRef.current) {
                        fetchActiveMessages(activeConversationIdRef.current);
                    }
                }
            }, 300);
        };
        
        document.addEventListener('visibilitychange', handleForegroundSync);
        window.addEventListener('focus', handleForegroundSync);
        window.addEventListener('pageshow', handleForegroundSync);
        
        return () => {
            clearTimeout(syncTimeout);
            document.removeEventListener('visibilitychange', handleForegroundSync);
            window.removeEventListener('focus', handleForegroundSync);
            window.removeEventListener('pageshow', handleForegroundSync);
        };
    }, [loadConversations, fetchActiveMessages]);

    return (
        <ChatContext.Provider value={{ 
            conversations, 
            messages, 
            sendMessage, 
            startConversation, 
            acceptConversation, 
            deleteConversation,
            deleteMessage,
            editMessage,
            muteConversation,
            clearChatHistory,
            sendMessageToConversation,
            loading, 
            activeConversationId, 
            setActiveConversationId,
            connected,
            loadMoreMessages,
            markMessageRead,
            markMessageDelivered,
            sendTypingStatus,
            typingUsers,
            drafts,
            setDraft,
            hasMore,
            markConversationRead,
            markConversationDelivered
        }}>
            {children}
        </ChatContext.Provider>
    );
};


