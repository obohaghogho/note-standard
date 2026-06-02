import { PerfMonitor } from '../utils/PerfMonitor';
import React, {
    createContext, useContext, useEffect, useState,
    useMemo, useCallback, useRef
} from 'react';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/apiClient';
import { AuthService } from '../services/AuthService';
import { socketManager } from '../platform/socket.native';
import { mobileTransportAdapter } from '../utils/mobileTransportAdapter';
import { mergeMessages } from 'shared/messageMergeEngine';
import { validateMessagePayload } from 'shared/payloadValidator';
import { normalizeEvent } from 'shared/eventNormalizer';
import { useSessionArbitration } from 'shared/hooks/useSessionArbitration';
import { ReadReceiptEngine } from 'shared/readReceiptEngine';
import { supabase } from '../lib/supabase';

export interface Message {
    id: string;
    event_id?: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    sequence_number?: number;
    created_at: string;
    type: string;
    isOwn: boolean;
    status?: 'sending' | 'sent' | 'failed' | string;
    read_at?: string;
    delivered_at?: string;
    reply_to?: any;
    _optimistic?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT 1: Conversations (Chat List) — stable, low-frequency updates
// ─────────────────────────────────────────────────────────────────────────────
interface ConversationsContextType {
    conversations: any[];
    loadConversations: () => Promise<void>;
    activeConversationId: string | null;
    setActiveConversationId: (id: string | null) => void;
    isActiveWriter: (conversationId: string) => boolean;
    isClaimingLease: (conversationId: string) => boolean;
}

const ConversationsContext = createContext<ConversationsContextType>({
    conversations: [],
    loadConversations: async () => {},
    activeConversationId: null,
    setActiveConversationId: () => {},
    isActiveWriter: () => true,
    isClaimingLease: () => false,
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT 2: Messages (Chat Screen) — high-frequency updates, scoped per conv
// ─────────────────────────────────────────────────────────────────────────────
interface MessagesContextType {
    messages: Record<string, Message[]>;
    sendMessage: (conversationId: string, text: string, attachmentId?: string, replyToId?: string) => Promise<void>;
    editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
    deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
    onMessageVisible: (conversationId: string, messageId: string) => void;
}

const MessagesContext = createContext<MessagesContextType>({
    messages: {},
    sendMessage: async () => {},
    editMessage: async () => {},
    deleteMessage: async () => {},
    onMessageVisible: () => {},
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY COMBINED CONTEXT — for backward compat with any old `useChat()` calls
// ─────────────────────────────────────────────────────────────────────────────
interface ChatContextType extends ConversationsContextType, MessagesContextType {}

const ChatContext = createContext<ChatContextType>({
    conversations: [],
    messages: {},
    sendMessage: async () => {},
    editMessage: async () => {},
    deleteMessage: async () => {},
    loadConversations: async () => {},
    activeConversationId: null,
    setActiveConversationId: () => {},
    isActiveWriter: () => true,
    isClaimingLease: () => false,
    onMessageVisible: () => {},
});

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────
export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();

    // ── State ──────────────────────────────────────────────────────────────────
    const [conversations, setConversations] = useState<any[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

    // ── Refs (zero-render access for hot paths) ────────────────────────────────
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const deviceIdRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const activeConversationIdRef = useRef<string | null>(null);
    const userRef = useRef(user);
    const messagesRef = useRef<Record<string, Message[]>>({});
    const conversationsRef = useRef<any[]>([]);

    // Event deduplication buffer
    const processedEventsRef = useRef(new Set<string>());

    // WebSocket event batching — prevents N messages = N renders
    const socketBatchRef = useRef<{ conv: string; msg: Message }[]>([]);
    const batchFlushScheduledRef = useRef(false);

    // Keep refs in sync with state (non-blocking)
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
    useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

    // ── Session init (AsyncStorage — never blocks render) ─────────────────────
    useEffect(() => {
        if (!user) return;
        const initSession = async () => {
            let localDeviceId = await AsyncStorage.getItem('chat_device_id');
            if (!localDeviceId) {
                localDeviceId = `mobile-${Math.random().toString(36).substring(2, 9)}`;
                await AsyncStorage.setItem('chat_device_id', localDeviceId);
            }
            setDeviceId(localDeviceId);
            deviceIdRef.current = localDeviceId;

            try {
                const res = await apiClient.post('/session/register', {
                    userId: user.id,
                    deviceId: localDeviceId,
                    userAgent: 'mobile-app'
                });
                if (res.data?.session_id) {
                    setSessionId(res.data.session_id);
                    sessionIdRef.current = res.data.session_id;
                }
            } catch (err) {
                console.warn('[ChatContext] Session registration failed', err);
            }
        };
        initSession();
    }, [user]);

    // ── Lease Arbitration ──────────────────────────────────────────────────────
    const { isActiveWriter, isClaimingLease, markLeaseClaimStart } = useSessionArbitration({
        sessionId,
        deviceId,
        supabase,
        initialConversations: conversations as any
    });

    // ── ReadReceiptEngine ──────────────────────────────────────────────────────
    const readReceiptEngine = useMemo(() => new ReadReceiptEngine(
        apiClient,
        () => deviceId,
        () => sessionId,
        (cid: string) => isActiveWriter(cid),
        (conversationId: string, lastMessageId: string) => {
            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        (m.id === lastMessageId || m.created_at <= nowStr) && !m.isOwn
                            ? { ...m, read_at: nowStr }
                            : m
                    )
                };
            });
            setConversations(prev => prev.map(c =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
            ));
        }
    ), [deviceId, isActiveWriter]);

    useEffect(() => {
        readReceiptEngine.flushQueue();
    }, [isActiveWriter, readReceiptEngine]);

    // ── Room management ────────────────────────────────────────────────────────
    const joinAllRooms = useCallback((convList: any[]) => {
        if (convList.length === 0) return;
        convList.forEach(conv => socketManager.joinRoom(conv.id));
    }, []);

    // ── Load Conversations ─────────────────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            const res = await apiClient.get('/chat/conversations');
            const data = res.data || [];
            setConversations(data);
            conversationsRef.current = data;
            joinAllRooms(data);
        } catch (err) {
            console.error('[ChatContext] Failed to load conversations', err);
        }
    }, [joinAllRooms]);

    // ── Load Messages ──────────────────────────────────────────────────────────
    const loadMessages = useCallback(async (conversationId: string) => {
        if (!user) return;
        try {
            const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
            const rawData = res.data || [];

            const processedData = await Promise.all(rawData.map(async (rawMsg: any) => {
                const plainContent = await mobileTransportAdapter.decodeIncomingMessage(rawMsg, user.id);
                return { ...rawMsg, content: plainContent || '[Decryption Failed]' };
            }));

            const normalized = processedData.map(normalizeEvent);
            const validated = (normalized as any[])
                .filter((msg: any) => validateMessagePayload(msg).valid)
                .map((msg: any) => ({ ...msg, isOwn: msg.sender_id === user.id }));

            setMessages(prev => ({
                ...prev,
                [conversationId]: mergeMessages(prev[conversationId] || [], validated).merged as Message[]
            }));

            // Offline delivery sync — deferred off the render critical path
            const unacked = validated.filter(msg => !msg.isOwn && msg.status !== 'read' && !msg.delivered_at);
            if (unacked.length > 0) {
                const latestMsg = unacked[unacked.length - 1];
                setTimeout(async () => {
                    try {
                        await apiClient.put(`/chat/conversations/${conversationId}/deliver`, {
                            deviceId: deviceIdRef.current,
                            lastMessageId: latestMsg.id
                        });
                        const socket = socketManager.instance;
                        if (socket) {
                            unacked.forEach(msg => {
                                socket.emit('chat:delivered', {
                                    conversationId,
                                    messageId: msg.id,
                                    deliveredAt: new Date().toISOString()
                                });
                            });
                        }
                    } catch (err) {
                        console.warn('[ChatContext] Offline delivery sync failed', err);
                    }
                }, 0);
            }
        } catch (err) {
            console.error('[ChatContext] Failed to load messages', err);
        }
    }, [user]);

    // ── BATCH FLUSH — Called via requestAnimationFrame ─────────────────────────
    // Processes ALL queued socket messages in ONE setState call.
    // This prevents N incoming messages from triggering N re-renders.
    const flushSocketBatch = useCallback(() => {
        const batch = socketBatchRef.current;
        socketBatchRef.current = [];
        batchFlushScheduledRef.current = false;

        if (batch.length === 0) return;
        PerfMonitor.start('flushBatchTime', 'flush', `batch:${batch.length}`);

        // Group by conversation for a single pass
        const byConv: Record<string, Message[]> = {};
        batch.forEach(({ conv, msg }) => {
            if (!byConv[conv]) byConv[conv] = [];
            byConv[conv].push(msg);
        });

        // Single atomic setState for all messages
        setMessages(prev => {
            const next = { ...prev };
            Object.entries(byConv).forEach(([convId, newMsgs]) => {
                next[convId] = mergeMessages(prev[convId] || [], newMsgs).merged as Message[];
            });
            return next;
        });

        PerfMonitor.end('flushBatchTime', 'flush');

        // Update conversations preview for each affected conversation
        setConversations(cPrev => {
            let updated = cPrev;
            Object.entries(byConv).forEach(([convId, newMsgs]) => {
                const newest = newMsgs[newMsgs.length - 1];
                const isCurrentlyOpen = activeConversationIdRef.current === convId;
                updated = updated.map(conv => {
                    if (conv.id !== convId) return conv;
                    const lastMsgAt = conv.last_message?.created_at ?? conv.lastMessage?.created_at ?? 0;
                    if (new Date(newest.created_at).getTime() < new Date(lastMsgAt).getTime()) return conv;
                    return {
                        ...conv,
                        updated_at: newest.created_at,
                        last_message: { id: newest.id, content: newest.content, sender_id: newest.sender_id, created_at: newest.created_at },
                        lastMessage: { id: newest.id, content: newest.content, sender_id: newest.sender_id, created_at: newest.created_at },
                        unreadCount: !isCurrentlyOpen && !newest.isOwn
                            ? (conv.unreadCount || 0) + newMsgs.filter(m => !m.isOwn).length
                            : conv.unreadCount
                    };
                });
            });
            return updated;
        });
    }, []);

    // ── Socket Pipeline ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        const setupSocket = async () => {
            const token = await AuthService.getToken();
            if (!token || cancelled) return;
            socketManager.connect(token, user.id);
            if (activeConversationId) socketManager.joinRoom(activeConversationId);
        };
        setupSocket();

        // INCOMING MESSAGE: Fast path — dedup, normalize, batch
        socketManager.on('chat:message', async (rawMsg: any) => {
            // ── Deduplication ──────────────────────────────────────────────────
            const dedupEventKey = rawMsg.event_id ? `evt:${rawMsg.event_id}` : null;
            const dedupIdKey = rawMsg.id && !String(rawMsg.id).startsWith('temp-') ? `id:${rawMsg.id}` : null;

            if (dedupEventKey && processedEventsRef.current.has(dedupEventKey)) return;
            if (dedupIdKey && processedEventsRef.current.has(dedupIdKey)) return;

            if (dedupEventKey) processedEventsRef.current.add(dedupEventKey);
            if (dedupIdKey) processedEventsRef.current.add(dedupIdKey);

            // Bound set size
            if (processedEventsRef.current.size > 2000) {
                const first = processedEventsRef.current.values().next().value;
                if (first !== undefined) processedEventsRef.current.delete(first);
            }

            // ── Decode + Normalize ─────────────────────────────────────────────
            const plainContent = await mobileTransportAdapter.decodeIncomingMessage(rawMsg, user.id);
            const processedMsg = { ...rawMsg, content: plainContent || rawMsg.content };
            const normalized = normalizeEvent(processedMsg) as any;
            if (!validateMessagePayload(normalized).valid) return;

            const incomingMessage: Message = {
                ...normalized,
                isOwn: normalized.sender_id === user.id
            };

            // ── Queue into batch buffer ────────────────────────────────────────
            socketBatchRef.current.push({ conv: normalized.conversation_id, msg: incomingMessage });

            // Schedule flush on next animation frame (batches rapid bursts)
            if (!batchFlushScheduledRef.current) {
                batchFlushScheduledRef.current = true;
                requestAnimationFrame(flushSocketBatch);
            }

            // ── Delivery ACK — DEFERRED off hot path ──────────────────────────
            if (!incomingMessage.isOwn) {
                setTimeout(() => {
                    apiClient.put(`/chat/messages/${incomingMessage.id}/deliver`, {
                        deviceId: deviceIdRef.current,
                        conversationId: incomingMessage.conversation_id
                    }).then(() => {
                        const socket = socketManager.instance;
                        if (socket) {
                            socket.emit('chat:delivered', {
                                conversationId: incomingMessage.conversation_id,
                                messageId: incomingMessage.id,
                                deliveredAt: new Date().toISOString()
                            });
                        }
                    }).catch(() => {});
                }, 0);
            }
        });

        socketManager.on('chat:delivery_receipt', (data: any) => {
            const { conversationId, messageId, deliveredAt } = data;
            setMessages(prev => {
                const current = prev[conversationId] || [];
                if (!current.some(m => m.id === messageId)) return prev;
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        m.id === messageId ? { ...m, status: 'delivered', delivered_at: deliveredAt } : m
                    )
                };
            });
        });

        socketManager.on('chat:read_receipt', (data: any) => {
            const { conversationId, messageIds, readAt } = data;
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        messageIds.includes(m.id) ? { ...m, status: 'read', read_at: readAt } : m
                    )
                };
            });
        });

        socketManager.on('chat:message_edited', (editedMsg: any) => {
            if (!editedMsg.conversation_id) return;
            setMessages(prev => {
                const current = prev[editedMsg.conversation_id] || [];
                return {
                    ...prev,
                    [editedMsg.conversation_id]: current.map(m =>
                        m.id === editedMsg.id ? { ...m, ...editedMsg } : m
                    )
                };
            });
        });

        socketManager.on('chat:message_deleted', (data: any) => {
            const { messageId, conversationId } = data;
            if (!conversationId) return;
            setMessages(prev => ({
                ...prev,
                [conversationId]: (prev[conversationId] || []).filter(m => m.id !== messageId)
            }));
        });

        loadConversations();

        return () => {
            cancelled = true;
            socketManager.offEvent('chat:message');
            socketManager.offEvent('chat:delivery_receipt');
            socketManager.offEvent('chat:read_receipt');
            socketManager.offEvent('chat:message_edited');
            socketManager.offEvent('chat:message_deleted');
        };
    }, [user]);

    // Fetch messages when conversation opens
    useEffect(() => {
        if (activeConversationId) {
            loadMessages(activeConversationId);
            socketManager.joinRoom(activeConversationId);
        }
    }, [activeConversationId]);

    // ── SEND MESSAGE — Zero-latency optimistic pipeline ────────────────────────
    const sendMessage = useCallback(async (
        conversationId: string, text: string, attachmentId?: string, replyToId?: string
    ) => {
        const currentUser = userRef.current;
        if (!currentUser) return;

        if (!isActiveWriter(conversationId)) {
            markLeaseClaimStart(conversationId);
        }

        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const clientEventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // STEP 1: Optimistic insert — happens BEFORE API call, UI is instant
        const optimisticMessage: Message = {
            id: tempId,
            event_id: clientEventId,
            conversation_id: conversationId,
            sender_id: currentUser.id,
            content: text,
            created_at: new Date().toISOString(),
            type: 'text',
            isOwn: true,
            status: 'sending',
            _optimistic: true,
        };

        setMessages(prev => ({
            ...prev,
            [conversationId]: mergeMessages(prev[conversationId] || [], [optimisticMessage]).merged as Message[]
        }));

        // Also update chat list preview immediately
        setConversations(cPrev => cPrev.map(conv => {
            if (conv.id !== conversationId) return conv;
            const lastMsgAt = conv.last_message?.created_at ?? conv.lastMessage?.created_at ?? 0;
            if (new Date(optimisticMessage.created_at).getTime() < new Date(lastMsgAt).getTime()) return conv;
            return {
                ...conv,
                last_message: { id: tempId, content: text, sender_id: currentUser.id, created_at: optimisticMessage.created_at },
                lastMessage: { id: tempId, content: text, sender_id: currentUser.id, created_at: optimisticMessage.created_at },
            };
        }));

        // STEP 2: API call happens in background — user already sees the bubble
        try {
            const payload = await mobileTransportAdapter.encodeOutgoingPayload(conversationId, text, currentUser.id);
            const currentDeviceId = deviceIdRef.current;
            const currentSessionId = sessionIdRef.current;

            const res = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
                ...payload,
                attachmentId,
                replyToId,
                eventId: clientEventId,
                type: 'text',
                ...(currentDeviceId ? { deviceId: currentDeviceId } : {}),
                ...(currentSessionId ? { sessionId: currentSessionId } : {}),
            });

            // STEP 3: Canonical collapse — replace temp- with server UUID
            const canonicalMessage: Message = { ...res.data, isOwn: true, status: 'sent' };

            // Pre-register in dedup buffer to drop gateway echo
            const canonEventKey = canonicalMessage.event_id ? `evt:${canonicalMessage.event_id}` : null;
            const canonIdKey = canonicalMessage.id && !String(canonicalMessage.id).startsWith('temp-')
                ? `id:${canonicalMessage.id}` : null;
            if (canonEventKey) processedEventsRef.current.add(canonEventKey);
            if (canonIdKey) processedEventsRef.current.add(canonIdKey);
            processedEventsRef.current.add(`evt:${clientEventId}`);

            setMessages(prev => ({
                ...prev,
                [conversationId]: mergeMessages(prev[conversationId] || [], [canonicalMessage]).merged as Message[]
            }));

            // Update chat list with confirmed message
            setConversations(cPrev => cPrev.map(conv => {
                if (conv.id !== conversationId) return conv;
                return {
                    ...conv,
                    updated_at: canonicalMessage.created_at,
                    last_message: { id: canonicalMessage.id, content: canonicalMessage.content, sender_id: canonicalMessage.sender_id, created_at: canonicalMessage.created_at },
                    lastMessage: { id: canonicalMessage.id, content: canonicalMessage.content, sender_id: canonicalMessage.sender_id, created_at: canonicalMessage.created_at },
                };
            }));

        } catch (err) {
            // Mark as failed — bubble shows retry state
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        m.id === tempId ? { ...m, status: 'failed', _optimistic: false } : m
                    )
                };
            });
        }
    }, [user, isActiveWriter, markLeaseClaimStart]);

    const editMessage = useCallback(async (conversationId: string, messageId: string, content: string) => {
        try {
            await apiClient.patch(`/chat/messages/${messageId}`, { content });
        } catch (err) {
            console.error('[ChatContext] Edit failed:', err);
            throw err;
        }
    }, []);

    const deleteMessage = useCallback(async (conversationId: string, messageId: string) => {
        // Optimistic delete
        setMessages(prev => ({
            ...prev,
            [conversationId]: (prev[conversationId] || []).filter(m => m.id !== messageId)
        }));
        try {
            await apiClient.delete(`/chat/messages/${messageId}`);
        } catch (err) {
            console.error('[ChatContext] Delete failed:', err);
            throw err;
        }
    }, []);

    const onMessageVisible = useCallback((conversationId: string, messageId: string) => {
        readReceiptEngine.onMessageVisible(conversationId, messageId);
    }, [readReceiptEngine]);

    // ── Context Values — isolated to minimize cross-context re-renders ──────────
    const conversationsContextValue = useMemo<ConversationsContextType>(() => ({
        conversations,
        loadConversations,
        activeConversationId,
        setActiveConversationId,
        isActiveWriter,
        isClaimingLease,
    }), [conversations, loadConversations, activeConversationId, isActiveWriter, isClaimingLease]);

    const messagesContextValue = useMemo<MessagesContextType>(() => ({
        messages,
        sendMessage,
        editMessage,
        deleteMessage,
        onMessageVisible,
    }), [messages, sendMessage, editMessage, deleteMessage, onMessageVisible]);

    // Legacy combined context value — for any existing useChat() consumers
    const legacyChatValue = useMemo<ChatContextType>(() => ({
        ...conversationsContextValue,
        ...messagesContextValue,
    }), [conversationsContextValue, messagesContextValue]);

    return (
        <ChatContext.Provider value={legacyChatValue}>
            <ConversationsContext.Provider value={conversationsContextValue}>
                <MessagesContext.Provider value={messagesContextValue}>
                    {children}
                </MessagesContext.Provider>
            </ConversationsContext.Provider>
        </ChatContext.Provider>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// SELECTORS
// ─────────────────────────────────────────────────────────────────────────────

/** Use ONLY in ChatListScreen — subscribes to conversation list changes only */
export const useConversations = () => useContext(ConversationsContext);

/** Use ONLY in ChatScreen — subscribes to messages for isolated rendering */
export const useMessages = () => useContext(MessagesContext);

/** Use ONLY in ChatScreen — returns messages for a single conversation */
export const useConversationMessages = (conversationId: string): Message[] => {
    const { messages } = useContext(MessagesContext);
    return messages[conversationId] || EMPTY_MESSAGES;
};
const EMPTY_MESSAGES: Message[] = [];

/** Legacy selector — still works but subscribes to BOTH contexts */
export const useChat = () => useContext(ChatContext);
