import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

import api from '../api/axiosInstance';
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
    sendMessage: (content: string, type?: string, attachmentId?: string, replyToId?: string) => Promise<void>;
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

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, session, authReady, isSwitching } = useAuth();
    const { socket, connected } = useSocket();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasMore] = useState<Record<string, boolean>>({});
    const [typingUsers] = useState<Record<string, string[]>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const isMounted = useRef(true);
    const conversationsFetchRef = useRef(false);
    const conversationsRef = useRef<Conversation[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const lastUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);


    const markMessageRead = useCallback(async (messageId: string) => {
        if (!session) return;
        try {
            await api.put(`/chat/messages/${messageId}/read`);
        } catch (err) {
            console.error('[Chat] Failed to mark read:', err);
        }
    }, [session]);

    const markMessageDelivered = useCallback(async (messageId: string) => {
        if (!session) return;
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
                setMessages(prev => ({ ...prev, [conversationId]: res.data }));
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
        if (activeConversationId) {
            loadMessages(activeConversationId);
        }
    }, [activeConversationId, loadMessages]);

    useEffect(() => {
        if (!socket || !connected) return;

        const processIncomingMessage = (msg: Message & { sender_id: string; conversation_id: string }) => {
            if (!isMounted.current) return;
            const newMessage: Message = { ...msg, isOwn: msg.sender_id === user?.id };
            setMessages(prev => {
                const current = prev[msg.conversation_id] || [];
                if (current.some(m => m.id === msg.id)) return prev;
                return { ...prev, [msg.conversation_id]: [...current, newMessage] };
            });
            setConversations(prev => prev.map(conv => {
                if (conv.id === msg.conversation_id) {
                    return {
                        ...conv,
                        updated_at: msg.created_at,
                        lastMessage: { content: msg.content, sender_id: msg.sender_id, created_at: msg.created_at },
                        unreadCount: (conv.unreadCount || 0) + (msg.sender_id !== user?.id ? 1 : 0)
                    };
                }
                return conv;
            }));
        };

        const onMessageDeleted = ({ messageId, conversationId }: { messageId: string, conversationId: string }) => {
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

        socket.on('chat:message', processIncomingMessage);
        socket.on('chat:message_deleted', onMessageDeleted);
        socket.on('chat:message_edited', onMessageEdited);
        
        return () => { 
            socket.off('chat:message', processIncomingMessage); 
            socket.off('chat:message_deleted', onMessageDeleted);
            socket.off('chat:message_edited', onMessageEdited);
        };
    }, [socket, connected, user?.id]);

    const sendMessageToConversation = async (conversationId: string, content: string, type: string = 'text', attachmentId?: string, replyToId?: string) => {
        if (!session || !user) throw new Error('Cannot send message');
        try {
            await api.post(`/chat/conversations/${conversationId}/messages`, { content, type, attachmentId, replyToId });
            // Optimization: Let socket handle update or loadMessages(conversationId);
        } catch (err) {
            toast.error('Failed to send message');
            throw err;
        }
    };

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
        try {
            await api.delete(`/chat/messages/${messageId}`);
            toast.success('Message deleted');
        } catch {
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

    const value: ChatContextValue = {
        conversations, messages, activeConversationId, loading, connected,
        setActiveConversationId,
        sendMessage: (content, type, attachmentId, replyToId) => sendMessageToConversation(activeConversationId!, content, type, attachmentId, replyToId),
        loadMoreMessages: async () => {},
        markMessageRead, markMessageDelivered,
        startConversation,
        acceptConversation: async () => {},
        deleteConversation: async () => {},
        deleteMessage, editMessage,
        muteConversation: async () => {},
        clearChatHistory: async () => {},
        sendTypingStatus: () => {},
        typingUsers, drafts, setDraft: (cid, content) => setDrafts(prev => ({ ...prev, [cid]: content })), 
        hasMore, sendMessageToConversation,
        markConversationRead, markConversationDelivered
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
