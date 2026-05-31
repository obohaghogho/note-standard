import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
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

interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    sequence_number?: number;
    created_at: string;
    type: string;
    isOwn: boolean;
    status?: 'sending' | 'sent' | 'failed';
}

interface ChatContextType {
    conversations: any[];
    messages: Record<string, Message[]>;
    sendMessage: (conversationId: string, text: string, attachmentId?: string, replyToId?: string) => Promise<void>;
    editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
    deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
    loadConversations: () => Promise<void>;
    activeConversationId: string | null;
    setActiveConversationId: (id: string | null) => void;
    isActiveWriter: (conversationId: string) => boolean;
    isClaimingLease: (conversationId: string) => boolean;
    // Phase 6: optimistic local read + lease-gated server ACK
    onMessageVisible: (conversationId: string, messageId: string) => void;
}

const ChatContext = createContext<ChatContextType>({
    conversations: [],
    messages: {},
    sendMessage: async () => { },
    editMessage: async () => { },
    deleteMessage: async () => { },
    loadConversations: async () => { },
    activeConversationId: null,
    setActiveConversationId: () => { },
    isActiveWriter: () => true,
    isClaimingLease: () => false,
    onMessageVisible: () => {},
});

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<any[]>([]);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const deviceIdRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const activeConversationIdRef = useRef<string | null>(null);
    const userRef = useRef(user);

    // Event Deduplication Buffer
    const processedEventsRef = useRef(new Set<string>());

    // Keep refs in sync with state
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
    useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);

    // Initialize Device and Session — persisting deviceId across restarts
    useEffect(() => {
        if (!user) return;
        const initSession = async () => {
            let localDeviceId = await AsyncStorage.getItem('chat_device_id');
            if (!localDeviceId) {
                localDeviceId = `mobile-${Math.random().toString(36).substring(2, 9)}`;
                await AsyncStorage.setItem('chat_device_id', localDeviceId);
            }
            // Write to both state (for renders) AND ref (for immediate use in
            // sendMessage without waiting for a render cycle to flush).
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
                    console.log('[ChatContext] ✓ Session registered:', res.data.session_id);
                } else {
                    console.warn('[ChatContext] Session registration returned no session_id — messages will send without session tracking');
                }
            } catch (err) {
                console.error('[ChatContext] Session registration failed', err);
            }
        };
        initSession();
    }, [user]);

    const { isActiveWriter, isClaimingLease, markLeaseClaimStart } = useSessionArbitration({
        sessionId,
        deviceId,
        supabase,
        initialConversations: conversations as any
    });

    // Phase 6: ReadReceiptEngine — AsyncStorage-backed, lease-gated, debounced read receipts
    const readReceiptEngine = useMemo(() => new ReadReceiptEngine(
        apiClient,
        () => deviceId,
        () => sessionId,
        (cid) => isActiveWriter(cid),
        // markLocalReadState: optimistic local update (blue ticks appear instantly on this device)
        (conversationId, lastMessageId) => {
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

    // Flush queued read intents when socket reconnects or lease changes
    useEffect(() => {
        readReceiptEngine.flushQueue();
    }, [isActiveWriter, readReceiptEngine]);

    // Platform Parity Safeguard
    if (__DEV__) {
        console.assert(
            typeof mergeMessages === "function",
            "Mobile must use shared merge engine"
        );
    }

    // ── 1. REST HYDRATION (Conversations) ───────────────────────────────────
    const loadConversations = async () => {
        try {
            const res = await apiClient.get('/chat/conversations');
            setConversations(res.data || []);
        } catch (err) {
            console.error('[ChatContext] Failed to load conversations', err);
        }
    };

    // ── 2. REST HYDRATION (Messages) ────────────────────────────────────────
    const loadMessages = async (conversationId: string) => {
        try {
            const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
            const rawData = res.data || [];
            
            // Decrypt payloads (if any are encrypted) and normalize
            const processedData = await Promise.all(rawData.map(async (rawMsg: any) => {
                const plainContent = await mobileTransportAdapter.decodeIncomingMessage(rawMsg, user!.id);
                return { ...rawMsg, content: plainContent || '[Decryption Failed]' };
            }));

            const normalized = processedData.map(normalizeEvent);
            const validated = normalized.filter(msg => validateMessagePayload(msg).valid).map(msg => ({
                ...msg,
                isOwn: msg.sender_id === user!.id
            }));

            // Use the single source of truth merge engine
            setMessages(prev => ({
                ...prev,
                [conversationId]: mergeMessages(prev[conversationId] || [], validated).merged
            }));

            // PHASE 2: OFFLINE DELIVERY SYNC ENGINE
            // Find messages from others that we haven't acknowledged as delivered yet
            const unacknowledgedMessages = validated.filter(msg => 
                !msg.isOwn && 
                msg.status !== 'read' && 
                !msg.delivered_at
            );

            if (unacknowledgedMessages.length > 0) {
                // Acknowledge the latest one to mark the conversation up to that point
                // Or loop through and ACK them (we'll just use the conversation level endpoint if available, 
                // or the latest message id to avoid API spam)
                const latestMsg = unacknowledgedMessages[unacknowledgedMessages.length - 1];
                try {
                    await apiClient.put(`/chat/conversations/${conversationId}/deliver`, {
                        deviceId,
                        lastMessageId: latestMsg.id
                    });

                    // Broadcast via socket for instant sender update
                    const socket = socketManager.instance;
                    if (socket) {
                        unacknowledgedMessages.forEach(msg => {
                            socket.emit('chat:delivered', {
                                conversationId,
                                messageId: msg.id,
                                deliveredAt: new Date().toISOString()
                            });
                        });
                    }
                } catch (err) {
                    console.error('[ChatContext] Offline delivery sync failed', err);
                }
            }

        } catch (err) {
            console.error('[ChatContext] Failed to load messages', err);
        }
    };

    // ── 3. SOCKET PIPELINE ──────────────────────────────────────────────────
    // FIXED: mobile AuthContext never exposes `session`, so we retrieve the
    // token directly from AuthService (AsyncStorage) instead.
    useEffect(() => {
        if (!user) return;

        let cancelled = false;

        const setupSocket = async () => {
            const token = await AuthService.getToken();
            if (!token || cancelled) return;

            socketManager.connect(token, user.id);

            // Use joinRoom() — safe to call before the handshake completes.
            // Rooms are tracked and auto re-joined on every connect/reconnect.
            if (activeConversationId) {
                socketManager.joinRoom(activeConversationId);
            }
        };

        setupSocket();

        // FIXED: gateway emits 'chat:message', NOT 'receive_message'
        socketManager.on('chat:message', async (rawMsg: any) => {
            // ── Own-message gateway echo guard ──────────────────────────────────
            // The gateway dispatches via pg_notify which broadcasts to ALL room
            // members including the sender. We pre-register sent messages in
            // processedEventsRef so echoes are silently dropped here.
            const isOwnIncoming = rawMsg.sender_id === user.id;

            // Deduplication: use prefixed composite keys for precision
            const dedupEventKey = rawMsg.event_id ? `evt:${rawMsg.event_id}` : null;
            const dedupIdKey    = rawMsg.id && !String(rawMsg.id).startsWith('temp-') ? `id:${rawMsg.id}` : null;

            if (dedupEventKey && processedEventsRef.current.has(dedupEventKey)) {
                console.log('[DEDUP/mobile] Dropping duplicate by event_id:', rawMsg.event_id);
                return;
            }
            if (dedupIdKey && processedEventsRef.current.has(dedupIdKey)) {
                console.log('[DEDUP/mobile] Dropping duplicate by id:', rawMsg.id);
                return;
            }

            // Register keys now so any subsequent delivery of this event is dropped
            if (dedupEventKey) processedEventsRef.current.add(dedupEventKey);
            if (dedupIdKey)    processedEventsRef.current.add(dedupIdKey);

            // Bound the set size to avoid memory leaks
            if (processedEventsRef.current.size > 2000) {
                const firstItem = processedEventsRef.current.values().next().value;
                if (firstItem !== undefined) processedEventsRef.current.delete(firstItem);
            }

            // If this is our own message being echoed back AND we already have it
            // in state (from optimistic update + API confirmation), drop the echo.
            // This covers the race where the dedup keys were registered by sendMessage
            // after the echo already passed through the early guards above.
            if (isOwnIncoming) {
                // Keys were already present — echo was handled above. If we reach
                // here, this is a fresh send from another device/tab of the same user.
                // Allow it to proceed so multi-device sync works correctly.
            }

            // 1. Decrypt via Transport Adapter
            const plainContent = await mobileTransportAdapter.decodeIncomingMessage(rawMsg, user.id);
            const processedMsg = { ...rawMsg, content: plainContent || '[Decryption Failed]' };

            // 2. Normalize
            const normalized = normalizeEvent(processedMsg);
            
            // 3. Validate Schema
            if (!validateMessagePayload(normalized).valid) {
                console.warn('[ChatContext] Dropping invalid socket payload', normalized);
                return;
            }

            const incomingMessage: Message = {
                ...normalized,
                isOwn: normalized.sender_id === user.id
            };

            // 4. Merge Engine (Deterministic atomic state mutation)
            setMessages(prev => {
                const currentMsgs = prev[normalized.conversation_id] || [];
                const { merged, newlyAddedCount } = mergeMessages(currentMsgs, [incomingMessage]);
                
                // Keep conversations state updated using the engine's deterministic delta
                if (newlyAddedCount > 0 || incomingMessage.sequence_number !== undefined) {
                    const isCurrentlyOpen = activeConversationIdRef.current === incomingMessage.conversation_id;
                    setConversations(cPrev => cPrev.map(conv => {
                        if (conv.id !== incomingMessage.conversation_id) return conv;

                        const existingLastMsgTime = new Date(conv.lastMessage?.created_at ?? 0).getTime();
                        const newMsgTime = new Date(incomingMessage.created_at).getTime();
                        const shouldUpdateLastMessage = newMsgTime >= existingLastMsgTime;
                        
                        const isLeaseOwner = isActiveWriter(conv.id);
                        const shouldIncrementUnread = isLeaseOwner && newlyAddedCount > 0 && !incomingMessage.isOwn && !isCurrentlyOpen;

                        if (!shouldUpdateLastMessage && !shouldIncrementUnread) return conv;

                        return {
                            ...conv,
                            updated_at: shouldUpdateLastMessage ? incomingMessage.created_at : conv.updated_at,
                            lastMessage: shouldUpdateLastMessage
                                ? { id: incomingMessage.id, content: incomingMessage.content, sender_id: incomingMessage.sender_id, created_at: incomingMessage.created_at }
                                : conv.lastMessage,
                            unreadCount: shouldIncrementUnread
                                ? (conv.unreadCount || 0) + newlyAddedCount
                                : conv.unreadCount
                        };
                    }));
                }

                return { ...prev, [normalized.conversation_id]: merged };
            });

            // PHASE 3: REALTIME DELIVERY ACK ENGINE
            // If the message is not ours, send a delivery ACK back immediately
            if (!incomingMessage.isOwn) {
                try {
                    // Call API to persist delivery status
                    await apiClient.put(`/chat/messages/${incomingMessage.id}/deliver`, {
                        deviceId,
                        conversationId: incomingMessage.conversation_id
                    });
                    
                    // Also emit via socket for instant realtime update to sender
                    const socket = socketManager.instance;
                    if (socket) {
                        socket.emit('chat:delivered', {
                            conversationId: incomingMessage.conversation_id,
                            messageId: incomingMessage.id,
                            deliveredAt: new Date().toISOString()
                        });
                    }
                } catch (err) {
                    console.error('[ChatContext] Failed to send delivery ACK', err);
                }
            }
        });

        socketManager.on('chat:delivery_receipt', (data: any) => {
            const { conversationId, messageId, deliveredAt } = data;
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => 
                        m.id === messageId 
                            ? { ...m, status: 'delivered', delivered_at: deliveredAt } 
                            : m
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
                        messageIds.includes(m.id)
                            ? { ...m, status: 'read', read_at: readAt } 
                            : m
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
                    [editedMsg.conversation_id]: current.map(m => m.id === editedMsg.id ? { ...m, ...editedMsg } : m)
                };
            });
        });

        socketManager.on('chat:message_deleted', (data: any) => {
            const { messageId, conversationId } = data;
            if (!conversationId) return;
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.filter(m => m.id !== messageId)
                };
            });
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
    }, [user]); // Removed activeConversationId so socket listeners are stable

    // Fetch messages when active conversation changes
    useEffect(() => {
        if (activeConversationId) {
            loadMessages(activeConversationId);
        }
    }, [activeConversationId]);

    // ── 4. OPTIMISTIC SEND PIPELINE ─────────────────────────────────────────
    const sendMessage = async (conversationId: string, text: string, attachmentId?: string, replyToId?: string) => {
        if (!user) return;

        // Phase 5: Soft Override Claim
        if (!isActiveWriter(conversationId)) {
            markLeaseClaimStart(conversationId);
            // Optionally dispatch a local event or UI toast
            console.log('Switching chat control to this device...');
        }

        // Step 1: Generate Client Event ID
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const clientEventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const optimisticMessage: Message = {
            id: tempId,
            event_id: clientEventId,
            conversation_id: conversationId,
            sender_id: user.id,
            content: text,
            created_at: new Date().toISOString(),
            type: 'text',
            isOwn: true,
            status: 'sending'
        };

        // Step 2: Optimistic Merge
        setMessages(prev => ({
            ...prev,
            [conversationId]: mergeMessages(prev[conversationId] || [], [optimisticMessage]).merged
        }));

        try {
            // Encode payload via Transport Adapter
            const payload = await mobileTransportAdapter.encodeOutgoingPayload(conversationId, text, user.id);

            // Step 3: Send via API (include canonical eventId)
            // Use refs to always get the latest IDs even if state hasn't re-rendered yet
            const currentDeviceId = deviceIdRef.current;
            const currentSessionId = sessionIdRef.current;
            const res = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
                ...payload,
                attachmentId,
                replyToId,
                eventId: clientEventId,
                type: 'text',
                ...(currentDeviceId ? { deviceId: currentDeviceId } : {}),
                ...(currentSessionId ? { sessionId: currentSessionId } : {})
            });

            // Step 4: Backend Collapse via Merge Engine
            const canonicalMessage = { ...res.data, isOwn: true, status: 'sent' };

            // Pre-register canonical IDs in the dedup buffer BEFORE merging state.
            // This ensures the gateway echo (which arrives shortly after) is cleanly
            // dropped by the socket listener above without reaching mergeMessages.
            const canonEventKey = canonicalMessage.event_id ? `evt:${canonicalMessage.event_id}` : null;
            const canonIdKey    = canonicalMessage.id && !String(canonicalMessage.id).startsWith('temp-') ? `id:${canonicalMessage.id}` : null;
            if (canonEventKey) processedEventsRef.current.add(canonEventKey);
            if (canonIdKey)    processedEventsRef.current.add(canonIdKey);
            // Also register the client event ID as a fallback key
            processedEventsRef.current.add(`evt:${clientEventId}`);

            setMessages(prev => ({
                ...prev,
                [conversationId]: mergeMessages(prev[conversationId] || [], [canonicalMessage]).merged
            }));

        } catch (err) {
            console.error('[ChatContext] Send failed:', err);
            // Revert status to failed safely
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
                };
            });
        }
    };

    const editMessage = async (conversationId: string, messageId: string, content: string) => {
        try {
            await apiClient.patch(`/chat/messages/${messageId}`, { content });
        } catch (err) {
            console.error('[ChatContext] Edit failed:', err);
            throw err;
        }
    };

    const deleteMessage = async (conversationId: string, messageId: string) => {
        try {
            await apiClient.delete(`/chat/messages/${messageId}`);
            setMessages(prev => ({
                ...prev,
                [conversationId]: (prev[conversationId] || []).filter(m => m.id !== messageId)
            }));
        } catch (err) {
            console.error('[ChatContext] Delete failed:', err);
            throw err;
        }
    };

    return (
        <ChatContext.Provider value={{
            conversations,
            messages,
            sendMessage,
            editMessage,
            deleteMessage,
            loadConversations,
            activeConversationId,
            setActiveConversationId,
            isActiveWriter,
            isClaimingLease,
            onMessageVisible: (conversationId, messageId) => readReceiptEngine.onMessageVisible(conversationId, messageId)
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => useContext(ChatContext);
