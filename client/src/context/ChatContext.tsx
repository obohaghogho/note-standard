import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

import api from '../api/axiosInstance';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

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
    status?: 'sending' | 'sent' | 'failed';
    reply_to?: {
        id: string;
        content: string;
        sender_id: string;
        type: string;
    };
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
        id: string;
        content: string;
        sender_id: string;
        created_at: string;
        read_at?: string;
        delivered_at?: string;
    };
    unreadCount?: number;
    is_muted?: boolean;
    isBlocked?: boolean;
    blockedByMe?: boolean;
    blockedByThem?: boolean;
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
    sendMessage: (content: string, type?: string, attachmentId?: string, replyToId?: string) => Promise<void>;
    sendMediaMessage: (file: File | Blob, type: 'image' | 'video' | 'audio' | 'file', conversationId?: string) => Promise<void>;
    loadMoreMessages: (conversationId: string) => Promise<void>;
    markMessageRead: (messageId: string) => Promise<void>;
    markMessageDelivered: (messageId: string) => Promise<void>;
    startConversation: (username: string) => Promise<string | null>; 
    acceptConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    deleteMessage: (messageId: string) => Promise<void>;
    editMessage: (messageId: string, content: string) => Promise<void>;
    muteConversation: (id: string, isMuted: boolean) => Promise<void>;
    clearChatHistory: (id: string) => Promise<void>;
    blockUser: (blockedId: string) => Promise<void>;
    unblockUser: (blockedId: string) => Promise<void>;
    sendTypingStatus: (isTyping: boolean) => void;
    typingUsers: Record<string, string[]>;
    drafts: Record<string, string>;
    setDraft: (conversationId: string, content: string) => void;
    hasMore: Record<string, boolean>;
    sendMessageToConversation: (conversationId: string, content: string, type?: string, attachmentId?: string, replyToId?: string) => Promise<void>;
    markConversationRead: (conversationId: string) => Promise<void>;
    markConversationDelivered: (conversationId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) throw new Error('useChat must be used within a ChatProvider');
    return context;
};

// Helper: Enforce precedence so a message never downgrades its delivery status
// Priority: read_at > delivered_at > sent
const mergeMessageStatus = (oldMsg: Message, newMsg: Partial<Message>): Message => {
    return {
        ...oldMsg,
        ...newMsg,
        // If old message had read_at, preserve it unless new message also has it
        read_at: newMsg.read_at || oldMsg.read_at,
        // If old message had delivered_at, preserve it unless new message also has it
        delivered_at: newMsg.delivered_at || oldMsg.delivered_at,
    };
};

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, session, authReady, isSwitching } = useAuth();
    const { socket, connected } = useSocket();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasMore] = useState<Record<string, boolean>>({});
    const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const isMounted = useRef(true);
    const conversationsFetchRef = useRef(false);
    const conversationsRef = useRef<Conversation[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const lastUserIdRef = useRef<string | null>(null);
    const activeConversationIdRef = useRef<string | null>(null);
    const messagesRef = useRef<Record<string, Message[]>>({});
    const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    // Tombstone: permanently tracks deleted message IDs across room switches, reconnects,
    // and page refreshes within the session. Any ingestion path filters against this.
    const deletedMessageIdsRef = useRef<Set<string>>(new Set());

    const sendTypingStatus = useCallback((isTyping: boolean) => {
        if (!socket || !connected || !activeConversationIdRef.current) return;
        
        if (isTyping) {
            socket.emit('typing', {
                conversationId: activeConversationIdRef.current
            });
        } else {
            socket.emit('stop_typing', {
                conversationId: activeConversationIdRef.current
            });
        }
    }, [socket, connected]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);


    const markMessageRead = useCallback(async (messageId: string, conversationId: string) => {
        if (!session) return;
        const now = new Date().toISOString();
        if (socketRef.current?.connected) {
            socketRef.current.emit('chat:read', { conversationId, messageIds: [messageId], readAt: now });
        }
        try {
            await api.put(`/chat/messages/${messageId}/read`);
        } catch (err) {
            console.error('[Chat] Failed to mark read:', err);
        }
    }, [session]);

    const markMessageDelivered = useCallback(async (messageId: string, conversationId: string) => {
        if (!session) return;
        const now = new Date().toISOString();
        if (socketRef.current?.connected) {
            socketRef.current.emit('chat:delivered', { conversationId, messageId, deliveredAt: now });
        }
        try {
            await api.put(`/chat/messages/${messageId}/deliver`);
        } catch (err) {
            console.error('[Chat] Failed to mark delivered:', err);
        }
    }, [session]);

    const markConversationDelivered = useCallback(async (conversationId: string) => {
        if (!session) return;
        try {
            await api.put(`/chat/conversations/${conversationId}/deliver`);
        } catch (err) {
            console.error('[Chat] Failed to mark conversation delivered:', err);
        }
    }, [session]);

    const markConversationRead = useCallback(async (conversationId: string) => {
        if (!session) return;
        try {
            await api.put(`/chat/conversations/${conversationId}/read`);
            setConversations(prev => prev.map(conv => conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv));
        } catch (err) {
            console.error('[Chat] Failed to mark conversation read:', err);
        }
    }, [session]);

    const joinAllRooms = useCallback((convList: Conversation[]) => {
        const s = socketRef.current;
        if (!s || !s.connected || convList.length === 0) return;
        convList.forEach(conv => s.emit('join_room', conv.id));
    }, []);

    const loadConversations = useCallback(async () => {
        if (!session || isSwitching || conversationsFetchRef.current) return;
        conversationsFetchRef.current = true;
        try {
            const response = await api.get('/chat/conversations');
            const data = response.data;
            if (isMounted.current && Array.isArray(data)) {
                const mappedData = data.map((conv: Conversation & { last_message?: Conversation['lastMessage'] }) => ({
                    ...conv,
                    lastMessage: conv.last_message 
                }));
                setConversations(mappedData);
                setLoading(false);
                joinAllRooms(mappedData);
                mappedData.forEach((conv: Conversation) => {
                    if (conv.unreadCount && conv.unreadCount > 0) markConversationDelivered(conv.id);
                });
            }
        } catch (e) {
            console.error('[Chat] Failed to load conversations:', e);
            if (isMounted.current) setLoading(false);
        } finally {
            conversationsFetchRef.current = false;
        }
    }, [session, isSwitching, joinAllRooms, markConversationDelivered]);

    const loadMessages = useCallback(async (conversationId: string) => {
        if (!session) return;
        try {
            const res = await api.get(`/chat/conversations/${conversationId}/messages`);
            if (isMounted.current) {
                // Hard-filter: remove any message that is in the tombstone (optimistically deleted
                // this session) or that the server already marked as soft-deleted.
                const filtered = (res.data as (Message & { is_deleted?: boolean })[]).filter(
                    m => !deletedMessageIdsRef.current.has(m.id) && !m.is_deleted
                );
                // Use mergeMessageStatus to ensure we never downgrade a message's delivery status
                // if the fast-path socket event beat the server response.
                setMessages(prev => {
                    const existingMap = new Map((prev[conversationId] || []).map(m => [m.id, m]));
                    const merged = filtered.map(m => {
                        const existing = existingMap.get(m.id);
                        return existing ? mergeMessageStatus(existing, m) : m;
                    });
                    return { ...prev, [conversationId]: merged };
                });
            }
        } catch (err) {
            console.error('[Chat] Failed to load messages:', err);
        }
    }, [session]);

    useEffect(() => {
        if (!authReady) return;
        isMounted.current = true;
        if (session && user) {
            if (user.id && lastUserIdRef.current && lastUserIdRef.current !== user.id) {
                setConversations([]);
                setMessages({});
                setLoading(true);
            }
            lastUserIdRef.current = user.id;
            loadConversations();
        } else if (!session) {
            setConversations([]);
            setMessages({});
            setLoading(false);
            lastUserIdRef.current = null;
        }
        return () => { isMounted.current = false; };
    }, [authReady, session, user, loadConversations]);

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
        if (activeConversationId) {
            loadMessages(activeConversationId);
            markConversationRead(activeConversationId);
        }
    }, [activeConversationId, loadMessages, markConversationRead]);

    // Re-subscribe all conversations on socket reconnect
    useEffect(() => {
        if (connected && conversations.length > 0) {
            joinAllRooms(conversations);
        }
    }, [connected, conversations, joinAllRooms]);

    useEffect(() => {
        if (!socket || !connected) return;

        const processIncomingMessage = (msg: Message & { sender_id: string; conversation_id: string } & { is_deleted?: boolean }) => {
            if (!isMounted.current) return;
            // Tombstone guard: reject any socket replay of a message we already deleted.
            if (deletedMessageIdsRef.current.has(msg.id) || msg.is_deleted) return;
            const newMessage: Message = { ...msg, isOwn: msg.sender_id === user?.id };
            
            // Mark as read immediately if this conversation is active and message is from another user
            if (activeConversationIdRef.current === msg.conversation_id && msg.sender_id !== user?.id) {
                markMessageRead(msg.id, msg.conversation_id);
            }

            // Mark as delivered immediately if received from another user
            if (msg.sender_id !== user?.id) {
                markMessageDelivered(msg.id, msg.conversation_id);
            }

            setMessages(prev => {
                const current = prev[msg.conversation_id] || [];
                if (current.some(m => m.id === msg.id)) return prev;

                // Handle optimistic UI matching for our own messages
                if (msg.sender_id === user?.id) {
                    const optimisticIndex = current.findIndex(m => 
                        (m.status === 'sending' || m.id.startsWith('temp-')) &&
                        (m.content === msg.content || m.type === msg.type)
                    );
                    if (optimisticIndex !== -1) {
                        const updated = [...current];
                        updated[optimisticIndex] = newMessage;
                        return { ...prev, [msg.conversation_id]: updated };
                    }
                }

                return { ...prev, [msg.conversation_id]: [...current, newMessage] };
            });

            // Increment unread count only if chat is NOT currently open
            const isCurrentlyOpen = activeConversationIdRef.current === msg.conversation_id;
            setConversations(prev => {
                const convExists = prev.some(c => c.id === msg.conversation_id);
                if (!convExists) {
                    // Conversation was likely cleared/deleted from UI, but a new message arrived!
                    // Re-fetch conversations to restore it.
                    setTimeout(() => loadConversations(), 100);
                    return prev;
                }

                return prev.map(conv => {
                    if (conv.id === msg.conversation_id) {
                        return {
                            ...conv,
                            updated_at: msg.created_at,
                            lastMessage: { content: msg.content, sender_id: msg.sender_id, created_at: msg.created_at },
                            unreadCount: isCurrentlyOpen ? 0 : (conv.unreadCount || 0) + (msg.sender_id !== user?.id ? 1 : 0)
                        };
                    }
                    return conv;
                });
            });
        };

        const onMessageDeleted = ({ messageId, conversationId }: { messageId: string, conversationId: string }) => {
            // Add to tombstone first so any in-flight loadMessages also filters it out.
            deletedMessageIdsRef.current.add(messageId);
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return { ...prev, [conversationId]: current.filter(m => m.id !== messageId) };
            });
        };

        const onMessageEdited = (editedMsg: Message) => {
            setMessages(prev => {
                const current = prev[editedMsg.conversation_id] || [];
                return { ...prev, [editedMsg.conversation_id]: current.map(m => m.id === editedMsg.id ? { ...m, ...editedMsg } : m) };
            });
        };

        const onMessageRead = ({ messageId, conversationId }: { messageId: string, conversationId: string }) => {
            if (!isMounted.current) return;
            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === messageId ? mergeMessageStatus(m, { read_at: nowStr }) : m)
                };
            });

            // ALSO update the last message in conversation list!
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage && c.lastMessage.id === messageId) {
                    return {
                        ...c,
                        lastMessage: mergeMessageStatus(c.lastMessage as any, { read_at: nowStr, delivered_at: nowStr }) as any
                    };
                }
                return c;
            }));
        };

        const onMessageDelivered = ({ messageId, conversationId }: { messageId: string, conversationId: string }) => {
            if (!isMounted.current) return;
            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === messageId ? mergeMessageStatus(m, { delivered_at: nowStr }) : m)
                };
            });

            // ALSO update the last message in conversation list!
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage && c.lastMessage.id === messageId) {
                    return {
                        ...c,
                        lastMessage: mergeMessageStatus(c.lastMessage as any, { delivered_at: nowStr }) as any
                    };
                }
                return c;
            }));
        };

        const onReadReceipt = ({ conversationId, messageIds }: { conversationId: string, messageIds: string[] }) => {
            if (!isMounted.current) return;
            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => messageIds.includes(m.id) ? mergeMessageStatus(m, { read_at: nowStr }) : m)
                };
            });

            // ALSO update the last message in conversation list!
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage && messageIds.includes(c.lastMessage.id)) {
                    return {
                        ...c,
                        lastMessage: mergeMessageStatus(c.lastMessage as any, { read_at: nowStr, delivered_at: nowStr }) as any
                    };
                }
                return c;
            }));
        };

        const onDeliveryReceipt = ({ conversationId, messageId }: { conversationId: string, messageId: string }) => {
            if (!isMounted.current) return;
            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === messageId ? mergeMessageStatus(m, { delivered_at: nowStr }) : m)
                };
            });

            // ALSO update the last message in conversation list!
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage && c.lastMessage.id === messageId) {
                    return {
                        ...c,
                        lastMessage: mergeMessageStatus(c.lastMessage as any, { delivered_at: nowStr }) as any
                    };
                }
                return c;
            }));
        };

        const onConversationUpdated = ({ conversationId, userId, status }: { conversationId: string, userId: string, status: string }) => {
            if (!isMounted.current) return;
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId) {
                    return {
                        ...c,
                        members: c.members.map(m => m.user_id === userId ? { ...m, status } : m)
                    };
                }
                return c;
            }));
        };

        const onConversationRead = ({ conversationId, readerId, readAt }: { conversationId: string, readerId: string, readAt: string }) => {
            if (!isMounted.current) return;
            if (readerId !== user?.id) {
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    return {
                        ...prev,
                        [conversationId]: current.map(m => m.sender_id === user?.id ? mergeMessageStatus(m, { read_at: readAt, delivered_at: readAt }) : m)
                    };
                });

                // ALSO update the last message in conversation list!
                setConversations(prev => prev.map(c => {
                    if (c.id === conversationId && c.lastMessage && c.lastMessage.sender_id === user?.id) {
                        return {
                            ...c,
                            lastMessage: mergeMessageStatus(c.lastMessage as any, { read_at: readAt, delivered_at: readAt }) as any
                        };
                    }
                    return c;
                }));
            } else {
                // If it is the current user who read it (e.g. from another device), clear unread count!
                setConversations(prev => prev.map(c => {
                    if (c.id === conversationId) {
                        return {
                            ...c,
                            unreadCount: 0,
                            lastMessage: c.lastMessage && c.lastMessage.sender_id !== user?.id ? { ...c.lastMessage, read_at: readAt } : c.lastMessage
                        };
                    }
                    return c;
                }));
            }
        };

        const onConversationDelivered = ({ conversationId, userId, delivered_at }: { conversationId: string, userId: string, delivered_at: string }) => {
            if (!isMounted.current) return;
            if (userId !== user?.id) {
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    return {
                        ...prev,
                        [conversationId]: current.map(m => m.sender_id === user?.id && !m.read_at ? mergeMessageStatus(m, { delivered_at: delivered_at }) : m)
                    };
                });

                // ALSO update the last message in conversation list!
                setConversations(prev => prev.map(c => {
                    if (c.id === conversationId && c.lastMessage && c.lastMessage.sender_id === user?.id && !c.lastMessage.read_at) {
                        return {
                            ...c,
                            lastMessage: mergeMessageStatus(c.lastMessage as any, { delivered_at: delivered_at }) as any
                        };
                    }
                    return c;
                }));
            }
        };

        const onTyping = ({ conversationId, userId, isTyping }: { conversationId: string, userId: string, isTyping: boolean }) => {
            if (!isMounted.current || userId === user?.id) return;
            
            setTypingUsers(prev => {
                const current = prev[conversationId] || [];
                if (isTyping) {
                    if (!current.includes(userId)) return { ...prev, [conversationId]: [...current, userId] };
                } else {
                    return { ...prev, [conversationId]: current.filter(id => id !== userId) };
                }
                return prev;
            });

            if (isTyping) {
                const key = `${conversationId}-${userId}`;
                if (typingTimeoutsRef.current[key]) clearTimeout(typingTimeoutsRef.current[key]);
                typingTimeoutsRef.current[key] = setTimeout(() => {
                    if (isMounted.current) {
                        setTypingUsers(prev => {
                            const current = prev[conversationId] || [];
                            return { ...prev, [conversationId]: current.filter(id => id !== userId) };
                        });
                    }
                }, 3000);
            }
        };

        socket.on('chat:message', processIncomingMessage);
        socket.on('chat:message_deleted', onMessageDeleted);
        socket.on('chat:message_edited', onMessageEdited);
        socket.on('chat:message_read', onMessageRead);
        socket.on('chat:message_delivered', onMessageDelivered);
        socket.on('chat:read_receipt', onReadReceipt);
        socket.on('chat:delivery_receipt', onDeliveryReceipt);
        socket.on('chat:conversation_updated', onConversationUpdated);
        socket.on('chat:conversation_read', onConversationRead);
        socket.on('chat:conversation_delivered', onConversationDelivered);
        socket.on('chat:typing', onTyping);
        
        return () => { 
            socket.off('chat:message', processIncomingMessage); 
            socket.off('chat:message_deleted', onMessageDeleted);
            socket.off('chat:message_edited', onMessageEdited);
            socket.off('chat:message_read', onMessageRead);
            socket.off('chat:message_delivered', onMessageDelivered);
            socket.off('chat:read_receipt', onReadReceipt);
            socket.off('chat:delivery_receipt', onDeliveryReceipt);
            socket.off('chat:conversation_updated', onConversationUpdated);
            socket.off('chat:conversation_read', onConversationRead);
            socket.off('chat:conversation_delivered', onConversationDelivered);
            socket.off('chat:typing', onTyping);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected, user?.id]);

    // Process Outbox when connection is restored
    useEffect(() => {
        if (!connected || !session || !user) return;
        const processOutbox = async () => {
            const currentOutbox = JSON.parse(localStorage.getItem('chat_outbox') || '[]');
            if (currentOutbox.length === 0) return;
            
            const remainingOutbox = [];
            for (const msg of currentOutbox) {
                try {
                    const res = await api.post(`/chat/conversations/${msg.conversation_id}/messages`, {
                        content: msg.content,
                        type: msg.type
                    });
                    setMessages(prev => {
                        const current = prev[msg.conversation_id] || [];
                        return {
                            ...prev,
                            [msg.conversation_id]: current.map(m => m.id === msg.id ? { ...res.data, isOwn: true, status: 'sent' } : m)
                        };
                    });
                } catch {
                    remainingOutbox.push(msg);
                }
            }
            if (remainingOutbox.length < currentOutbox.length) {
                toast.success('Offline messages sent');
            }
            localStorage.setItem('chat_outbox', JSON.stringify(remainingOutbox));
        };
        processOutbox();
    }, [connected, session, user]);

    const sendMessageToConversation = async (conversationId: string, content: string, type: string = 'text', attachmentId?: string, replyToId?: string) => {
        if (!session || !user) throw new Error('Cannot send message');
        
        // Find the message being replied to for optimistic UI
        let replyToData = undefined;
        if (replyToId) {
            const allMsgs = messagesRef.current[conversationId] || [];
            const originalMsg = allMsgs.find((m: Message) => m.id === replyToId);
            if (originalMsg) {
                replyToData = {
                    id: originalMsg.id,
                    content: originalMsg.content,
                    sender_id: originalMsg.sender_id,
                    type: originalMsg.type
                };
            }
        }

        // Optimistic UI Update
        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            created_at: new Date().toISOString(),
            type: (type || 'text') as Message['type'],
            isOwn: true,
            status: 'sending',
            reply_to: replyToData
        };
        
        setMessages(prev => {
            const current = prev[conversationId] || [];
            return { ...prev, [conversationId]: [...current, optimisticMessage] };
        });

        try {
            const res = await api.post(`/chat/conversations/${conversationId}/messages`, { content, type, attachmentId, replyToId });
            
            // Server response replaces optimistic message
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === tempId ? { ...res.data, isOwn: true, status: 'sent' } : m)
                };
            });
            return res.data;
        } catch (err) {
            // Update optimistic message status to failed and store in Outbox
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
                };
            });
            const outboxMsg = { ...optimisticMessage, status: 'failed' };
            const currentOutbox = JSON.parse(localStorage.getItem('chat_outbox') || '[]');
            localStorage.setItem('chat_outbox', JSON.stringify([...currentOutbox, outboxMsg]));
            toast.error('Failed to send message, saved to outbox');
            throw err;
        }
    };

    const sendMediaMessage = useCallback(async (
        file: File | Blob, 
        type: 'image' | 'video' | 'audio' | 'file', 
        customConversationId?: string
    ) => {
        const conversationId = customConversationId || activeConversationId;
        if (!conversationId || !session || !user) {
            toast.error('Cannot send media message');
            return;
        }

        const tempId = `temp-${Date.now()}`;
        const fileName = (file as File).name || `audio_${Date.now()}.webm`;
        const fileSize = file.size;
        const fileType = file.type;

        // 1. Generate local blob/object URL for instant rendering
        const localUrl = URL.createObjectURL(file);

        // 2. Build and insert optimistic message
        const optimisticMessage: Message = {
            id: tempId,
            conversation_id: conversationId,
            sender_id: user.id,
            content: `Shared a ${type}: ${fileName}`,
            created_at: new Date().toISOString(),
            type,
            isOwn: true,
            status: 'sending',
            attachment: {
                id: tempId,
                file_name: fileName,
                file_type: fileType,
                file_size: fileSize,
                storage_path: localUrl,
                metadata: {
                    localPreview: localUrl,
                    progress: 0
                }
            }
        };

        setMessages(prev => {
            const current = prev[conversationId] || [];
            return { ...prev, [conversationId]: [...current, optimisticMessage] };
        });

        // 3. Trigger asynchronous background upload
        const runBackgroundUpload = async () => {
            let progressInterval: ReturnType<typeof setInterval> | undefined;
            try {
                // Perform upload to Supabase Storage
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(7);
                const safeName = fileName.replace(/[^a-zA-Z0-9.]/g, '_');
                
                let filePath = '';
                if (type === 'audio') {
                    // Upload raw recording to temporary folder first
                    filePath = `temp/raw_${timestamp}_${randomStr}_${safeName}`;
                } else {
                    filePath = `${conversationId}/${timestamp}_${randomStr}_${safeName}`;
                }

                // Smooth simulated progress bar increments by 10-15% up to 90%
                let currentProgress = 0;
                progressInterval = setInterval(() => {
                    if (currentProgress < 90) {
                        currentProgress += Math.floor(Math.random() * 15) + 5;
                        if (currentProgress > 90) currentProgress = 90;
                        setMessages(prev => {
                            const current = prev[conversationId] || [];
                            return {
                                ...prev,
                                [conversationId]: current.map(m => m.id === tempId ? {
                                    ...m,
                                    attachment: m.attachment ? {
                                        ...m.attachment,
                                        metadata: { ...m.attachment.metadata, progress: currentProgress }
                                    } : undefined
                                } : m)
                            };
                        });
                    }
                }, 300);

                const { error: uploadError } = await supabase.storage
                    .from('chat-media')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: fileType || (type === 'audio' ? 'audio/webm' : undefined)
                    });

                if (uploadError) throw uploadError;

                let attachment = null;
                if (type === 'audio') {
                    // Trigger backend transcode processing
                    const transcodeRes = await api.post('/media/process-audio', {
                        storagePath: filePath,
                        conversationId
                    });
                    attachment = transcodeRes.data;
                } else {
                    // Create the attachment record in DB directly for other media types
                    const attachmentRes = await api.post('/media/attachments', {
                        conversationId,
                        fileName,
                        fileType,
                        fileSize,
                        storagePath: filePath,
                        metadata: {
                            original_name: fileName,
                            uploaded_at: new Date().toISOString()
                        }
                    });
                    attachment = attachmentRes.data;
                }

                // Stop progress interval and set to 100%
                if (progressInterval) clearInterval(progressInterval);
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    return {
                        ...prev,
                        [conversationId]: current.map(m => m.id === tempId ? {
                            ...m,
                            attachment: m.attachment ? {
                                ...m.attachment,
                                metadata: { ...m.attachment.metadata, progress: 100 }
                            } : undefined
                        } : m)
                    };
                });

                // Send the actual message
                const msgRes = await api.post(`/chat/conversations/${conversationId}/messages`, {
                    content: type === 'audio' ? 'Sent a voice message' : `Shared a ${type}: ${fileName}`,
                    type,
                    attachmentId: attachment.id
                });

                // Replace the optimistic message in state with the final server message
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    return {
                        ...prev,
                        [conversationId]: current.map(m => m.id === tempId ? { ...msgRes.data, isOwn: true, status: 'sent' } : m)
                    };
                });

                // Clean up local preview URL
                URL.revokeObjectURL(localUrl);

            } catch (err) {
                console.error('[ChatContext] Background media upload failed:', err);
                if (progressInterval) clearInterval(progressInterval);
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    return {
                        ...prev,
                        [conversationId]: current.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
                    };
                });
                toast.error(`Failed to send ${type}`);
            }
        };

        runBackgroundUpload();
    }, [activeConversationId, session, user]);

    const startConversation = async (username: string): Promise<string | null> => {
        try {
            const res = await api.post('/chat/conversations', { participants: [username], type: 'direct' });
            const id = res.data.conversation.id;
            setActiveConversationId(id);
            loadConversations();
            return id;
        } catch {
            toast.error('Failed to start conversation');
            return null;
        }
    };

    const deleteMessage = async (messageId: string) => {
        // 1. Find the message in the current state so we can restore it on failure.
        let savedMsg: Message | undefined;
        let savedConvId: string | undefined;
        setMessages(prev => {
            // Search all loaded conversations for this message id.
            for (const [convId, msgs] of Object.entries(prev)) {
                const found = msgs.find(m => m.id === messageId);
                if (found) {
                    savedMsg = found;
                    savedConvId = convId;
                    break;
                }
            }
            if (!savedConvId) return prev; // already gone
            // 2. Optimistic removal.
            return { ...prev, [savedConvId]: prev[savedConvId].filter(m => m.id !== messageId) };
        });

        // 3. Add to tombstone so loadMessages won't re-hydrate this ID.
        deletedMessageIdsRef.current.add(messageId);

        try {
            await api.delete(`/chat/messages/${messageId}`);
            // Success — tombstone entry stays permanently for this session.
        } catch {
            // 4. Rollback: restore the message and remove from tombstone.
            deletedMessageIdsRef.current.delete(messageId);
            if (savedMsg && savedConvId) {
                setMessages(prev => ({
                    ...prev,
                    [savedConvId!]: [...(prev[savedConvId!] || []), savedMsg!]
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                }));
            }
            toast.error('Failed to delete message');
        }
    };

    const editMessage = async (messageId: string, content: string) => {
        try {
            await api.patch(`/chat/messages/${messageId}`, { content });
            toast.success('Message updated');
        } catch {
            toast.error('Failed to edit message');
        }
    };

    const blockUser = async (blockedId: string) => {
        try {
            await api.post('/chat/block', { blockedId });
            toast.success('User blocked');
            loadConversations();
        } catch {
            toast.error('Failed to block user');
        }
    };

    const unblockUser = async (blockedId: string) => {
        try {
            await api.post('/chat/unblock', { blockedId });
            toast.success('User unblocked');
            loadConversations();
        } catch {
            toast.error('Failed to unblock user');
        }
    };

    const acceptConversation = async (conversationId: string) => {
        try {
            await api.put(`/chat/conversations/${conversationId}/accept`);
            toast.success('Conversation accepted');
            loadConversations();
        } catch {
            toast.error('Failed to accept conversation');
        }
    };

    const deleteConversation = async (conversationId: string) => {
        try {
            await api.delete(`/chat/conversations/${conversationId}`);
            toast.success('Chat deleted');
            if (activeConversationId === conversationId) {
                setActiveConversationId(null);
            }
            setConversations(prev => prev.filter(c => c.id !== conversationId));
        } catch {
            toast.error('Failed to delete chat');
        }
    };

    const muteConversation = async (conversationId: string, isMuted: boolean) => {
        try {
            await api.put(`/chat/conversations/${conversationId}/mute`, { isMuted });
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId) {
                    return { ...c, is_muted: isMuted };
                }
                return c;
            }));
        } catch {
            throw new Error('Failed to mute conversation');
        }
    };

    const clearChatHistory = async (conversationId: string) => {
        try {
            await api.delete(`/chat/conversations/${conversationId}/messages`);
            toast.success('Chat history cleared');
            setMessages(prev => ({ ...prev, [conversationId]: [] }));
        } catch {
            toast.error('Failed to clear chat history');
        }
    };

    const value: ChatContextValue = {
        conversations, messages, activeConversationId, loading, connected,
        setActiveConversationId,
        sendMessage: (content, type, attachmentId, replyToId) => sendMessageToConversation(activeConversationId!, content, type, attachmentId, replyToId),
        sendMediaMessage,
        loadMoreMessages: async () => {},
        markMessageRead, markMessageDelivered,
        startConversation,
        acceptConversation,
        deleteConversation,
        deleteMessage, editMessage,
        muteConversation,
        clearChatHistory,
        blockUser,
        unblockUser,
        sendTypingStatus,
        typingUsers, drafts, setDraft: (cid, content) => setDrafts(prev => ({ ...prev, [cid]: content })), 
        hasMore, sendMessageToConversation,
        markConversationRead, markConversationDelivered
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
