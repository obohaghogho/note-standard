import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { NotificationService } from '../services/NotificationService';
import { API_URL } from '../lib/api';

interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    type: 'text' | 'image' | 'video' | 'file' | 'audio';
    isOwn?: boolean;
    original_language?: string;
    read_at?: string;
    attachment?: {
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        storage_path: string;
        metadata: any;
    };
}

interface Conversation {
    id: string;
    type: 'direct' | 'group';
    chat_type?: 'support' | 'general' | 'admin';
    name: string;
    updated_at: string;
    lastMessage?: {
        content: string;
        sender_id: string;
        created_at: string;
        read_at?: string;
    };
    unreadCount?: number;
    members: {
        user_id: string;
        role: string;
        status: string;
        profile?: {
            username: string;
            full_name: string;
            avatar_url: string;
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
    startConversation: (username: string) => Promise<void>; 
    acceptConversation: (id: string) => Promise<void>;
    hasMore: Record<string, boolean>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) throw new Error('useChat must be used within a ChatProvider');
    return context;
};

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, session, authReady } = useAuth();
    const { socket, connected } = useSocket();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState<Record<string, boolean>>({});

    const isMounted = useRef(true);
    const conversationsFetchRef = useRef(false);

    const loadConversations = useCallback(async () => {
        if (!session || conversationsFetchRef.current) return;
        
        conversationsFetchRef.current = true;
        
        try {
            console.log('[Chat] Loading conversations');
            const res = await fetch(`${API_URL}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (!res.ok) throw new Error(`Failed to load conversations: ${res.status}`);
            
            const data = await res.json();
            
            if (isMounted.current) {
                // Map backend last_message object to lastMessage
                const mappedData = data.map((conv: any) => ({
                    ...conv,
                    lastMessage: conv.last_message 
                }));
                setConversations(mappedData);
                setLoading(false);
            }
        } catch (e) {
            console.error('[Chat] Failed to load conversations:', e);
            if (isMounted.current) setLoading(false);
        } finally {
            conversationsFetchRef.current = false;
        }
    }, [session?.access_token]);

    // Initial load
    useEffect(() => {
        isMounted.current = true;
        if (authReady) {
            if (session) {
                loadConversations();
            } else {
                setLoading(false);
            }
        }
        return () => { isMounted.current = false; };
    }, [authReady, session?.access_token, loadConversations]);

    // Socket listeners
    useEffect(() => {
        if (!socket || !connected) return;

        const processIncomingMessage = (msg: any) => {
            if (!isMounted.current) return;
            
            const newMessage: Message = {
                id: msg.id,
                conversation_id: msg.conversation_id,
                sender_id: msg.sender_id,
                content: msg.content,
                created_at: msg.created_at,
                type: msg.type,
                isOwn: msg.sender_id === user?.id,
                original_language: msg.original_language,
                attachment: msg.attachment
            };

            if (msg.sender_id !== user?.id) {
                const sender = conversations.find(c => c.id === msg.conversation_id)?.members.find(m => m.user_id === msg.sender_id)?.profile?.username || 'Someone';
                NotificationService.notifyNewMessage(sender, msg.content, msg.conversation_id);
            }

            setMessages(prev => ({
                ...prev,
                [msg.conversation_id]: [...(prev[msg.conversation_id] || []), newMessage]
            }));

            // Update conversation unread count and last message
            setConversations(prev => prev.map(conv => {
                if (conv.id === msg.conversation_id) {
                    const isOtherMsg = msg.sender_id !== user?.id;
                    const isActive = msg.conversation_id === activeConversationId;
                    return {
                        ...conv,
                        updated_at: msg.created_at,
                        lastMessage: {
                            content: msg.content,
                            sender_id: msg.sender_id,
                            created_at: msg.created_at
                        },
                        unreadCount: (conv.unreadCount || 0) + (isOtherMsg && !isActive ? 1 : 0)
                    };
                }
                return conv;
            }));

            // Auto-mark as read if active
            if (msg.conversation_id === activeConversationId && msg.sender_id !== user?.id) {
                markMessageRead(msg.id);
            }
        };

        const onMessageRead = ({ messageId, conversationId }: any) => {
            setMessages(prev => {
                const convMessages = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: convMessages.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m)
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

        const onNewConversation = () => {
            loadConversations();
        };

        socket.on('receive_message', processIncomingMessage);
        socket.on('new_conversation', onNewConversation);
        socket.on('message_read', onMessageRead);

        conversations.forEach(conv => {
            socket.emit('join_room', conv.id);
        });

        return () => {
            socket.off('receive_message', processIncomingMessage);
            socket.off('new_conversation', onNewConversation);
            socket.off('message_read', onMessageRead);
        };
    }, [socket, connected, conversations, user?.id, loadConversations, activeConversationId]);

    const sendMessage = async (content: string, type: string = 'text', attachmentId?: string) => {
        if (!session || !activeConversationId) throw new Error('Cannot send message');
        
        const res = await fetch(`${API_URL}/api/chat/conversations/${activeConversationId}/messages`, {
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
    };

    const loadMoreMessages = async (conversationId: string) => {
        const currentM = messages[conversationId] || [];
        if (currentM.length === 0 || !session) return;

        const oldest = currentM[0].created_at;
        
        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/messages?before=${oldest}&limit=30`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.length < 30) {
                    setHasMore(prev => ({ ...prev, [conversationId]: false }));
                } else {
                    setHasMore(prev => ({ ...prev, [conversationId]: true }));
                }
                setMessages(prev => ({
                    ...prev,
                    [conversationId]: [...data, ...(prev[conversationId] || [])]
                }));
            }
        } catch (err) {
            console.error('[Chat] Load more failed:', err);
        }
    };

    const markMessageRead = async (messageId: string) => {
        if (!session) return;
        try {
            await fetch(`${API_URL}/api/chat/messages/${messageId}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
        } catch (err) {
            console.error('[Chat] Failed to mark read:', err);
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
        } else {
            const err = await res.json();
            throw new Error(err.error || 'Failed to start chat');
        }
    };

    const acceptConversation = async (conversationId: string) => {
        if (!session) throw new Error('No session');
        
        try {
            const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/accept`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (res.ok) {
                loadConversations();
            }
        } catch (err) {
            console.error('[Chat] Failed to accept conversation:', err);
            throw err;
        }
    };

    // Load messages for active conversation
    useEffect(() => {
        if (!activeConversationId || !session) return;

        const fetchMessages = async () => {
            try {
                const res = await fetch(`${API_URL}/api/chat/conversations/${activeConversationId}/messages`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                
                if (!res.ok) return;
                
                const rawMessages = await res.json();
                if (!isMounted.current) return;

                const messageList: Message[] = rawMessages.map((msg: any) => ({
                    id: msg.id,
                    conversation_id: msg.conversation_id,
                    sender_id: msg.sender_id,
                    content: msg.content,
                    created_at: msg.created_at,
                    type: msg.type,
                    isOwn: msg.sender_id === user?.id,
                    original_language: msg.original_language,
                    attachment: msg.attachment
                }));

                setMessages(prev => ({ ...prev, [activeConversationId]: messageList }));
                setHasMore(prev => ({ ...prev, [activeConversationId]: rawMessages.length >= 50 }));

                // Mark last message as read if not own
                const lastMsg = messageList[messageList.length - 1];
                if (lastMsg && !lastMsg.isOwn && !lastMsg.read_at) {
                    markMessageRead(lastMsg.id);
                }
            } catch (err) {
                console.error('[Chat] Failed to fetch messages:', err);
            }
        };

        fetchMessages();
    }, [activeConversationId, session?.access_token, user?.id]);

    return (
        <ChatContext.Provider value={{ 
            conversations, 
            messages, 
            sendMessage, 
            startConversation, 
            acceptConversation, 
            loading, 
            activeConversationId, 
            setActiveConversationId,
            connected,
            loadMoreMessages,
            markMessageRead,
            hasMore
        }}>
            {children}
        </ChatContext.Provider>
    );
};
