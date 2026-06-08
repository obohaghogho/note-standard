import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { validateMessagePayload, normalizeSequenceNumber } from 'shared/payloadValidator';
import { mergeMessages } from 'shared/messageMergeEngine';
import { useSessionArbitration } from 'shared/hooks/useSessionArbitration';
import { OfflineQueueEngine } from 'shared/offlineQueueEngine';
import { ensureLeaseOwnership } from 'shared/leaseBarrier';
import { ReadReceiptEngine } from 'shared/readReceiptEngine';

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
    // Phase 3: sequence integrity fields (optional for legacy compat)
    sequence_number?: number;
    conversation_version?: number;
    event_id?: string;
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
        type?: string;
        is_edited?: boolean;
        read_at?: string;
        delivered_at?: string;
        status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
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
    sendMessage: (payload: { content: string; type?: string; attachmentId?: string; replyTo?: { id: string; content: string; sender_id: string; type?: string; attachment?: { id: string; file_name: string; file_type: string; file_size: number; storage_path: string; metadata: Record<string, unknown> } } }) => Promise<void>;
    sendMediaMessage: (file: File | Blob, type: 'image' | 'video' | 'audio' | 'file', conversationId?: string) => Promise<void>;
    loadMoreMessages: (conversationId: string) => Promise<void>;
    markMessageRead: (messageId: string, conversationId: string) => Promise<void>;
    markMessageDelivered: (messageId: string, conversationId: string) => Promise<void>;
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
    sendMessageToConversation: (payload: { conversationId: string; content: string; type?: string; attachmentId?: string; replyTo?: { id: string; content: string; sender_id: string; type?: string } }) => Promise<void>;
    markConversationRead: (conversationId: string) => Promise<void>;
    markConversationDelivered: (conversationId: string) => Promise<void>;
    isActiveWriter: (conversationId: string) => boolean;
    isClaimingLease: (conversationId: string) => boolean;
    // Phase 6: optimistic local read + lease-gated server ACK
    onMessageVisible: (conversationId: string, messageId: string) => void;
    clearState: () => void;
    initialize: () => Promise<void>;
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
    const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
    const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    // Holds the in-flight initSession promise so sendMessageToConversation
    // can await it instead of throwing immediately when sessionId is null.
    const sessionInitPromiseRef = useRef<Promise<string | null> | null>(null);
    const deviceIdRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    // Keep refs in sync so the send function always reads the latest value
    // without causing extra renders.
    useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);
    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

    const isMounted = useRef(true);

    // Initialize Device and Session
    useEffect(() => {
        // Wait for auth to be fully ready and session token to be available.
        // This prevents the Axios interceptor's safeAuth() from being throttled
        // on page load, which caused 401s and "Could not obtain sessionId" warnings.
        if (!user || !session?.access_token || !authReady) return;

        const doRegister = async (localDeviceId: string, token: string): Promise<string | null> => {
            // Pass the token directly in the per-request headers.
            // The Axios interceptor now skips safeAuth() when Authorization is already set,
            // so this bypasses the throttle while keeping all other Axios behaviour.
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const res = await api.post('/session/register', {
                        userId: user.id,
                        deviceId: localDeviceId,
                        userAgent: navigator.userAgent
                    }, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.data?.session_id) return res.data.session_id;
                    console.warn(`[ChatContext] Session registration attempt ${attempt}/3 — no session_id in response`, res.data);
                } catch (err: unknown) {
                    const status = (err as {response?: {status?: number}})?.response?.status;
                    console.error(`[ChatContext] Session registration attempt ${attempt}/3 failed (HTTP ${status ?? 'network'})`, err);
                }
                if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500));
            }
            return null;
        };

        const initSession = async () => {
            let localDeviceId = localStorage.getItem('chat_device_id');
            if (!localDeviceId) {
                localDeviceId = `web-${Math.random().toString(36).substring(2, 9)}`;
                localStorage.setItem('chat_device_id', localDeviceId);
            }
            setDeviceId(localDeviceId);
            deviceIdRef.current = localDeviceId;

            const sid = await doRegister(localDeviceId, session.access_token);
            if (sid && isMounted.current) {
                setSessionId(sid);
                sessionIdRef.current = sid;
            } else if (!sid) {
                console.warn('[ChatContext] Could not obtain sessionId after 3 attempts — messages will queue until session is ready');
            }
            return sid;
        };

        sessionInitPromiseRef.current = initSession();
    // Re-run when session token refreshes (Supabase auto-refreshes every ~55 min)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, session?.access_token, authReady]);


    const { isActiveWriter, isClaimingLease, markLeaseClaimStart, markLeaseClaimEnd, leases } = useSessionArbitration({
        sessionId,
        deviceId,
        supabase,
        initialConversations: conversations as Conversation[]
    });

    // Phase 6: ReadReceiptEngine — optimistic local state + debounced server emission
    const readReceiptEngine = useMemo(() => new ReadReceiptEngine(
        api,
        () => deviceId,
        () => sessionId,
        (cid: string) => isActiveWriter(cid),
        // markLocalReadState: update UI immediately so blue ticks show on this device instantly
        (conversationId: string, lastMessageId: string) => {
            setMessages(prev => {
                const current = prev[conversationId] || [];
                const nowStr = new Date().toISOString();
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        m.id === lastMessageId || (m.created_at <= new Date(nowStr).toISOString() && !m.isOwn)
                            ? mergeMessageStatus(m, { read_at: nowStr })
                            : m
                    )
                };
            });
            // Clear conversation unread count optimistically
            setConversations(prev => prev.map(c =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
            ));
        }
    ), [deviceId, sessionId, isActiveWriter]);

    // Flush any queued read intents when device becomes active writer
    useEffect(() => {
        if (connected) readReceiptEngine.flushQueue();
    }, [connected, isActiveWriter, readReceiptEngine]);
    const conversationsFetchRef = useRef(false);
    const conversationsRef = useRef<Conversation[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const lastUserIdRef = useRef<string | null>(null);
    const activeConversationIdRef = useRef<string | null>(null);
    const messagesRef = useRef<Record<string, Message[]>>({});
    const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    // Tombstone: permanently tracks deleted message IDs across room switches and reconnects.
    const deletedMessageIdsRef = useRef<Set<string>>(new Set());
    // Phase 3: per-conversation sequence high-water mark (mirrors server-side replayGuard)
    // Sentinel -1 means "not yet seen any sequenced message for this conversation".
    const lastSeenSequenceRef = useRef<Record<string, number>>({});
    // Deduplication buffer: tracks processed event_id and canonical id values to prevent
    // gateway echo (pg_notify broadcasts to ALL room members including sender) from
    // triggering duplicate merge operations. Bounded at 2000 entries to prevent memory leak.
    const processedEventIdsRef = useRef<Set<string>>(new Set());
    // Phase 2 Optimization: tracks when each conversation's messages were last loaded.
    // Prevents redundant API round-trips when a user re-opens a warm conversation (<30s).
    const messagesCachedAtRef = useRef<Record<string, number>>({});

    // PERF FIX: Debounced conversation-level mark-read.
    // Replaces per-message markMessageRead + markMessageDelivered HTTP calls.
    // Fires markConversationRead at most once per 1.5s per conversation, regardless
    // of how many messages arrive in a burst. Uses a per-conversation timer map.
    const debouncedMarkReadTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const debouncedMarkReadRef = useRef((conversationId: string) => {
        if (debouncedMarkReadTimers.current[conversationId]) {
            clearTimeout(debouncedMarkReadTimers.current[conversationId]);
        }
        debouncedMarkReadTimers.current[conversationId] = setTimeout(() => {
            // Only fire for the active conversation to avoid marking background chats as read
            if (activeConversationIdRef.current === conversationId) {
                markConversationRead(conversationId);
            } else {
                // For background conversations, just fire the server-side delivered mark
                markConversationDelivered(conversationId);
            }
        }, 1500);
    });

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

    // Keep socketRef always current — same zero-cost pattern as messagesRef/conversationsRef.
    // MUST be a direct assignment (not useEffect) so joinAllRooms never reads a stale ref
    // on the render cycle immediately following a socket connect or reconnect event.
    socketRef.current = socket;


    const markMessageRead = useCallback(async (messageId: string, conversationId: string) => {
        if (!session || !deviceId) return;
        const now = new Date().toISOString();
        if (socketRef.current?.connected) {
            socketRef.current.emit('chat:read', { conversationId, messageIds: [messageId], readAt: now, deviceId });
        }
        try {
            await api.put(`/chat/conversations/${conversationId}/read`, { deviceId, lastMessageId: messageId });
        } catch (err) {
            console.error('[Chat] Failed to mark read:', err);
        }
    }, [session, deviceId]);

    const markMessageDelivered = useCallback(async (messageId: string, conversationId: string) => {
        if (!session || !deviceId) return;
        const now = new Date().toISOString();
        if (socketRef.current?.connected) {
            socketRef.current.emit('chat:delivered', { conversationId, messageId, deliveredAt: now, deviceId });
        }
        try {
            await api.put(`/chat/messages/${messageId}/deliver`, { deviceId });
        } catch (err) {
            console.error('[Chat] Failed to mark delivered:', err);
        }
    }, [session, deviceId]);

    const markConversationDelivered = useCallback(async (conversationId: string) => {
        if (!session || !deviceId) return;
        try {
            await api.put(`/chat/conversations/${conversationId}/deliver`, { deviceId });
        } catch (err) {
            console.error('[Chat] Failed to mark conversation delivered:', err);
        }
    }, [session, deviceId]);

    const markConversationRead = useCallback(async (conversationId: string) => {
        if (!session || !deviceId) return;
        
        // Find the conversation to check if it actually has unread messages
        // This prevents infinite loops if this is called in a useEffect that depends on `conversations`
        setConversations(prev => {
            const conv = prev.find(c => c.id === conversationId);
            if (!conv || conv.unreadCount === 0) return prev; // No-op, preserves array reference
            
            // Fire API asynchronously since we know it needs update
            api.put(`/chat/conversations/${conversationId}/read`, { deviceId }).catch(err => {
                console.error('[Chat] Failed to mark conversation read:', err);
            });
            
            return prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c);
        });
    }, [session, deviceId]);

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
                
                // Requirement 9: Prevent conversation overwrite race. Merge-by-id logic.
                setConversations(prev => {
                    const existingMap = new Map(prev.map(c => [c.id, c]));
                    mappedData.forEach((c: Conversation) => existingMap.set(c.id, c));
                    return Array.from(existingMap.values()).sort((a, b) => 
                        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                    );
                });
                
                setLoading(false);
                joinAllRooms(mappedData);
                // PERF FIX: Removed markConversationDelivered call per unread conversation.
                // Previously this fired N full-table UPDATE writes on every page load
                // (one per unread conversation). Delivery status is now maintained
                // exclusively via real-time socket events (chat:message_delivered)
                // which are emitted by the server immediately when a message is received.

                // Phase 4: Conversation Preloading (PERF FIX: reduced from 5 → 2)
                // Preload only the 2 most recent conversations to reduce cold-start I/O.
                // Delayed 2 seconds so preloads don't compete with the initial render.
                setTimeout(() => {
                    if (!isMounted.current) return;
                    mappedData.slice(0, 2).forEach((conv: Conversation) => {
                        // Pass force=false to respect STALE_MS gate
                        loadMessages(conv.id, false);
                    });
                }, 2000);
            }
        } catch (e) {
            console.error('[Chat] Failed to load conversations:', e);
            if (isMounted.current) setLoading(false);
        } finally {
            conversationsFetchRef.current = false;
            // ── Overlay pending offline-queue intents onto the conversation list ──
            // After loading conversations from the server, check if there are any
            // messages still queued (not yet sent). If so, update the conversation
            // preview so the user sees their unsent message instead of the old one.
            // This prevents the "Chairlady" reversal on page refresh.
            try {
                const offlineQueueEngine = new OfflineQueueEngine({
                    getItem: (key: string) => localStorage.getItem(key),
                    setItem: (key: string, value: string) => localStorage.setItem(key, value)
                });
                const pendingIntents = await offlineQueueEngine.getPendingIntents();
                if (pendingIntents.length > 0 && isMounted.current) {
                    // Group by conversation_id — take the most recent intent per conversation
                    const latestByConv = new Map<string, typeof pendingIntents[0]>();
                    for (const intent of pendingIntents) {
                        const existing = latestByConv.get(intent.conversation_id);
                        if (!existing || intent.created_at > existing.created_at) {
                            latestByConv.set(intent.conversation_id, intent);
                        }
                    }

                    setConversations(prev => prev.map(conv => {
                        const intent = latestByConv.get(conv.id);
                        if (!intent) return conv;

                        const intentTime = intent.created_at;
                        const serverTime = new Date(conv.updated_at ?? 0).getTime();

                        // Only override the preview if the intent is newer than the server data
                        if (intentTime <= serverTime) return conv;

                        const pendingPreview = {
                            id: `temp-${intent.event_id}`,
                            content: `⏳ ${intent.payload.content}`,
                            sender_id: conv.participants?.find(p => p)?.id ?? '',
                            created_at: new Date(intentTime).toISOString(),
                            type: (intent.payload.type || 'text') as 'text' | 'image' | 'video' | 'audio' | 'file'
                        };

                        return {
                            ...conv,
                            lastMessage: pendingPreview,
                            last_message: pendingPreview
                        };
                    }));

                    console.log(`[Chat] Overlaid ${latestByConv.size} pending intent(s) onto conversation list`);
                }
            } catch (queueErr) {
                console.warn('[Chat] Failed to overlay pending intents onto conversation list:', queueErr);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, isSwitching, joinAllRooms]);

    const loadSingleConversation = useCallback(async (conversationId: string) => {
        if (!session || isSwitching) return;
        try {
            const response = await api.get(`/chat/conversations/${conversationId}`);
            if (isMounted.current && response.data) {
                const conv = response.data;
                setConversations(prev => {
                    // Check if it already got loaded by loadConversations in the meantime
                    if (prev.some(c => c.id === conversationId)) return prev;
                    return [conv, ...prev];
                });
            }
        } catch (e) {
            console.error('[Chat] Failed to load single conversation:', e);
        }
    }, [session, isSwitching]);

    const loadMessages = useCallback(async (conversationId: string, force = false) => {
        if (!session) return;

        // Phase 2 Optimization: Staleness gate.
        // Skip the API call if we loaded this conversation's messages within the last 30 seconds
        // AND the caller didn't explicitly force a refresh. The socket handler updates messages
        // directly via setMessages, so the local state stays fresh without a round-trip.
        const STALE_MS = 30_000;
        const lastLoaded = messagesCachedAtRef.current[conversationId] ?? 0;
        if (!force && Date.now() - lastLoaded < STALE_MS) {
            if (import.meta.env.DEV) {
                console.log(`[Chat] loadMessages: cache hit for ${conversationId} (${Date.now() - lastLoaded}ms old) — skipping refetch`);
            }
            return;
        }

        try {
            const res = await api.get(`/chat/conversations/${conversationId}/messages`);
            if (isMounted.current) {
                // Record cache timestamp before setting state
                messagesCachedAtRef.current[conversationId] = Date.now();

                // Hard-filter: remove any message that is in the tombstone (optimistically deleted
                // this session) or that the server already marked as soft-deleted.
                const filtered = (res.data as (Message & { is_deleted?: boolean })[]).filter(
                    m => !deletedMessageIdsRef.current.has(m.id) && !m.is_deleted
                );
                
                // Phase 3.2: Deterministic Merge Engine
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    const { merged } = mergeMessages(current, filtered);

                    if (import.meta.env.DEV) {
                        console.log('[SYNC_FORENSICS]', {
                            stage: 'loadMessages',
                            event: 'rest_sync',
                            conversationId,
                            incomingPayloadCount: filtered.length,
                        });
                    }

                    return { ...prev, [conversationId]: merged as Message[] };
                });

                // ── Hydrate pending offline-queue intents ──────────────────────────
                // After merging server messages, layer in any intents that are still
                // queued for THIS conversation. This guarantees that messages the user
                // sent while offline / while the gateway was sleeping remain visible
                // after a page refresh instead of silently disappearing.
                try {
                    const offlineQueueEngine = new OfflineQueueEngine({
                        getItem: (key: string) => localStorage.getItem(key),
                        setItem: (key: string, value: string) => localStorage.setItem(key, value)
                    });
                    const pendingIntents = await offlineQueueEngine.getPendingIntents();
                    const convIntents = pendingIntents.filter(i => i.conversation_id === conversationId);

                    if (convIntents.length > 0 && isMounted.current) {
                        // Build optimistic Message objects from each intent.
                        // We use the existing user id from the session; we do NOT
                        // have the canonical server id yet so we keep the temp-* id.
                        const pendingMessages: Message[] = convIntents.map(intent => ({
                            id: `temp-${intent.event_id}`,
                            event_id: intent.event_id,
                            conversation_id: conversationId,
                            sender_id: user?.id ?? '',
                            content: intent.payload.content,
                            created_at: new Date(intent.created_at).toISOString(),
                            type: (intent.payload.type || 'text') as Message['type'],
                            isOwn: true,
                            status: intent.status === 'failed' ? 'failed' : 'sending',
                            reply_to: intent.payload.replyTo ? {
                                id: intent.payload.replyTo.id,
                                content: intent.payload.replyTo.content ?? '',
                                sender_id: intent.payload.replyTo.sender_id ?? '',
                                type: intent.payload.replyTo.type ?? 'text'
                            } : undefined
                        }));

                        console.log(`[Chat] Hydrating ${pendingMessages.length} pending intent(s) into conversation ${conversationId}`);

                        setMessages(prev => {
                            const current = prev[conversationId] || [];
                            const { merged } = mergeMessages(current, pendingMessages);
                            return { ...prev, [conversationId]: merged as Message[] };
                        });
                    }
                } catch (queueErr) {
                    // Non-fatal: if queue hydration fails, server messages still display correctly
                    console.warn('[Chat] Failed to hydrate offline queue intents:', queueErr);
                }
            }
        } catch (err) {
            console.error('[Chat] Failed to load messages:', err);
        }
    }, [session, user?.id]);

    const clearState = useCallback(() => {
        console.log(`[ACCOUNT_FORENSIC] CHAT_CLEAR_STATE - Dropping chat caches at ${Date.now()}`);
        setConversations([]);
        setMessages({});
        setActiveConversationId(null);
        setLoading(true);
        setTypingUsers({});
        setHasMore({});
        lastUserIdRef.current = null;
        // Clear message cache timestamps so next account gets a fresh load
        messagesCachedAtRef.current = {};
        // Clear deduplication caches on account switch
        deletedMessageIdsRef.current = new Set();
        processedEventIdsRef.current = new Set();
        lastSeenSequenceRef.current = {};
    }, []);

    const initialize = useCallback(async () => {
        console.log(`[ACCOUNT_FORENSIC] CHAT_INITIALIZE - Fetching chat data at ${Date.now()}`);
        await loadConversations();
        console.log(`[ACCOUNT_FORENSIC] CONVERSATIONS_READY - Chat data ready at ${Date.now()}`);
    }, [loadConversations]);

    useEffect(() => {
        if (!authReady) return;
        isMounted.current = true;
        if (session && user) {
            if (user.id && lastUserIdRef.current && lastUserIdRef.current !== user.id) {
                clearState();
            }
            lastUserIdRef.current = user.id;
            loadConversations();
        } else if (!session) {
            clearState();
            setLoading(false);
        }
        return () => { isMounted.current = false; };
    }, [authReady, session, user, loadConversations, clearState]);

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
        if (activeConversationId) {
            // Check if we already have the conversation. If not, fetch it specifically for faster loading.
            if (!conversationsRef.current.some(c => c.id === activeConversationId)) {
                loadSingleConversation(activeConversationId);
            }
            loadMessages(activeConversationId);
            markConversationRead(activeConversationId);
        }
    }, [activeConversationId, loadMessages, markConversationRead, loadSingleConversation]);

    // Re-subscribe all conversations on socket reconnect
    useEffect(() => {
        if (connected && conversations.length > 0) {
            joinAllRooms(conversations);
        }
    }, [connected, conversations, joinAllRooms]);

    useEffect(() => {
        console.log(`[SYNC_FORENSICS] ChatContext socket effect evaluated | socket exists: ${!!socket} | connected: ${connected}`);
        if (!socket || !connected) return;

        const processIncomingMessage = (raw: unknown) => {
            if (!isMounted.current) return;

            const validation = validateMessagePayload(raw);
            if (!validation.valid) {
                console.log(`[SYNC_FORENSICS] [CLIENT_TRACE] schema validation: FAIL | reason: ${validation.reason}`);
                return;
            }
            const msg = validation.data as Message & { is_deleted?: boolean };

            console.log(`[SYNC_FORENSICS] [CLIENT_TRACE] [${Date.now()}] chat:message received | id: ${msg.id} | convId: ${msg.conversation_id} | activeConvId: ${activeConversationIdRef.current}`);

            // ── Tombstone guard: reject replays of deleted messages ────────────
            if (deletedMessageIdsRef.current.has(msg.id) || msg.is_deleted) {
                console.log(`[CLIENT_TRACE] tombstone guard: FAIL (dropped) | id: ${msg.id}`);
                return;
            }

            // ── Phase 3: User guard — ensure user is hydrated before unread logic
            if (!user?.id) {
                console.log(`[CLIENT_TRACE] user guard: FAIL (dropped — user not hydrated) | id: ${msg.id}`);
                return;
            }

            // ── Own-message echo guard ────────────────────────────────────────
            // The gateway uses pg_notify which broadcasts to ALL room members
            // including the sender. The sender already has the canonical message
            // from the API response (flushQueue → setMessages). We must drop
            // this echo before it reaches mergeMessages to prevent duplication.
            const isOwnMessage = msg.sender_id === user.id;
            console.log(`[CLIENT_TRACE] isOwnMessage: ${isOwnMessage} | sender: ${msg.sender_id} | viewer: ${user.id}`);
            if (isOwnMessage) {
                // Check by event_id first (most reliable — set at send time)
                const dedupEventKey = msg.event_id;
                const dedupIdKey = msg.id;
                const alreadyTrackedByEvent = dedupEventKey ? processedEventIdsRef.current.has(`evt:${dedupEventKey}`) : false;
                const alreadyTrackedById = dedupIdKey && !dedupIdKey.startsWith('temp-') ? processedEventIdsRef.current.has(`id:${dedupIdKey}`) : false;

                if (alreadyTrackedByEvent || alreadyTrackedById) {
                    console.log(`[CLIENT_TRACE] own-message echo guard: FAIL (dropped) | event_id: ${msg.event_id} | id: ${msg.id}`);
                    return;
                }
                // Track this canonical server ID going forward so re-deliveries are also dropped
                if (dedupIdKey && !dedupIdKey.startsWith('temp-')) {
                    processedEventIdsRef.current.add(`id:${dedupIdKey}`);
                }
                if (dedupEventKey) {
                    processedEventIdsRef.current.add(`evt:${dedupEventKey}`);
                }
                // Bound the set to prevent memory leaks
                if (processedEventIdsRef.current.size > 2000) {
                    const firstKey = processedEventIdsRef.current.values().next().value;
                    if (firstKey !== undefined) processedEventIdsRef.current.delete(firstKey);
                }
            }

            // ── Phase 3: Type-safe sequence deduplication ─────────────────────
            const seq = normalizeSequenceNumber(msg.sequence_number);

            if (seq !== undefined) {
                const lastSeen = lastSeenSequenceRef.current[msg.conversation_id] ?? -1;

                if (seq <= lastSeen && !isOwnMessage) {
                    console.log(`[CLIENT_TRACE] sequence dedup: FAIL (dropped stale replay) | seq: ${seq} lastSeen: ${lastSeen} | id: ${msg.id}`);
                    return;
                }
                lastSeenSequenceRef.current[msg.conversation_id] = Math.max(lastSeen, seq);
            }

            const newMessage: Message = { ...msg, isOwn: isOwnMessage };
            console.log(`[CLIENT_TRACE] [${Date.now()}] processIncomingMessage: PASS (all gates cleared) | id: ${msg.id} | convId: ${msg.conversation_id}`);

            // PERF FIX: Replace per-message HTTP calls with debounced conversation-level read.
            // Previously: every received message fired markMessageRead() + markMessageDelivered()
            // as separate HTTP PUT requests (2 DB writes per message × message volume).
            // Now: use a 1.5s debounced conversation-level read which is O(1) regardless
            // of how many messages arrive in a burst. The per-message socket events
            // (chat:delivered, chat:read) handle real-time tick updates on the UI.
            if (!isOwnMessage) {
                // Debounced: fires at most once per 1.5s per conversation
                debouncedMarkReadRef.current(msg.conversation_id);
            }

            // Pre-injection guard
            let safeNewMessage = newMessage;
            if (!newMessage.reply_to?.id) {
                const currentMsgs = messagesRef.current[msg.conversation_id] || [];
                const existingInState = currentMsgs.find(
                    m => (msg.event_id && m.event_id === msg.event_id) || m.id === msg.id
                );
                if (existingInState?.reply_to?.id) {
                    safeNewMessage = { ...newMessage, reply_to: existingInState.reply_to };
                }
            }

            // Determine if this is actually a new message to drive Conversation updates
            const currentMsgs = messagesRef.current[msg.conversation_id] || [];
            const isExisting = currentMsgs.some(m => m.id === msg.id || (msg.event_id && m.event_id === msg.event_id));
            const newlyAddedCount = isExisting ? 0 : 1;
            console.log(`[CLIENT_TRACE] [${Date.now()}] newlyAddedCount=${newlyAddedCount} | isExisting: ${isExisting} | messages before=${currentMsgs.length}`);

            // Phase 3.2: Atomic State Mutation using Merge Engine
            console.log(`[CLIENT_TRACE] [${Date.now()}] setMessages called`);
            setMessages(prev => {
                const current = prev[msg.conversation_id] || [];
                const { merged } = mergeMessages(current, [safeNewMessage]);
                console.log(`[CLIENT_TRACE] [${Date.now()}] messages state updated: PASS | next state size: ${merged.length}`);
                return { ...prev, [msg.conversation_id]: merged as Message[] };
            });

            // Only update conversations if something materially changed (new message, or sequence update)
            if (newlyAddedCount > 0 || msg.sequence_number !== undefined) {
                const isCurrentlyOpen = activeConversationIdRef.current === msg.conversation_id;

                console.log(`[CLIENT_TRACE] [${Date.now()}] setConversations called: PASS`);
                setConversations(cPrev => {
                    const convExists = cPrev.some(c => c.id === msg.conversation_id);
                    if (!convExists) {
                        console.log(`[CLIENT_TRACE] [${Date.now()}] conversation filtering: FAIL (conversation not in state, triggering fetch)`);
                        setTimeout(() => loadConversations(), 100);
                        return cPrev;
                    }

                    const nextConvs = cPrev.map(conv => {
                        if (conv.id !== msg.conversation_id) return conv;

                        const existingTs = conv.lastMessage?.created_at;
                        const existingLastMsgTime = existingTs ? new Date(existingTs).getTime() : 0;
                        const newMsgTime = new Date(msg.created_at).getTime();
                        const shouldUpdateLastMessage = newMsgTime >= existingLastMsgTime;

                        const shouldIncrementUnread = !isCurrentlyOpen && !isOwnMessage && newlyAddedCount > 0;

                        if (!shouldUpdateLastMessage && !shouldIncrementUnread) {
                            console.log(`[CLIENT_TRACE] [${Date.now()}] React memoization preventing rerender: PASS (No material change to conv)`);
                            return conv;
                        }

                        return {
                            ...conv,
                            updated_at: shouldUpdateLastMessage ? msg.created_at : conv.updated_at,
                            lastMessage: shouldUpdateLastMessage
                                ? {
                                    id: msg.id,
                                    content: msg.content,
                                    sender_id: msg.sender_id,
                                    created_at: msg.created_at,
                                    status: (msg.status ?? 'sent') as NonNullable<Conversation['lastMessage']>['status']
                                  }
                                : conv.lastMessage,
                            unreadCount: shouldIncrementUnread
                                ? (conv.unreadCount || 0) + newlyAddedCount
                                : conv.unreadCount
                        };
                    }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                    
                    console.log(`[CLIENT_TRACE] [${Date.now()}] conversations state updated: PASS | next state size: ${nextConvs.length}`);
                    return nextConvs;
                });
            } else {
                 console.log(`[CLIENT_TRACE] [${Date.now()}] duplicate message filtering: PASS (newlyAddedCount=0, seq=undefined)`);
            }
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
                return {
                    ...prev,
                    [editedMsg.conversation_id]: current.map(m => {
                        if (m.id !== editedMsg.id) return m;
                        return {
                            ...m,
                            ...editedMsg,
                            // Phase 8: reply_to guard — server edit payload may not carry the
                            // full reply_to join. Never let a partial broadcast overwrite a
                            // valid local reply snapshot.
                            reply_to: editedMsg.reply_to ?? m.reply_to,
                        };
                    })
                };
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
                        lastMessage: mergeMessageStatus(c.lastMessage as Message, { read_at: nowStr, delivered_at: nowStr }) as Conversation['lastMessage']
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
                        lastMessage: mergeMessageStatus(c.lastMessage as Message, { delivered_at: nowStr }) as Conversation['lastMessage']
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
                        lastMessage: mergeMessageStatus(c.lastMessage as Message, { read_at: nowStr, delivered_at: nowStr }) as Conversation['lastMessage']
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
                        lastMessage: mergeMessageStatus(c.lastMessage as Message, { delivered_at: nowStr }) as Conversation['lastMessage']
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
                        lastMessage: mergeMessageStatus(c.lastMessage as Message, { read_at: readAt, delivered_at: readAt }) as Conversation['lastMessage']
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
                        lastMessage: mergeMessageStatus(c.lastMessage as Message, { delivered_at: delivered_at }) as Conversation['lastMessage']
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

        // Re-join ALL conversation rooms on every socket reconnect.
        // Socket.IO drops all rooms when the transport disconnects and reconnects
        // with a new socket.id. Without this, the receiver's socket is no longer
        // in the conversation room and never receives incoming chat:message events.
        // This handler fires on both initial connect AND every subsequent reconnect.
        const onSocketReconnect = () => {
            const currentConvs = conversationsRef.current;
            if (currentConvs.length > 0) {
                console.log(`[ChatContext] 🔄 Socket reconnected — re-joining ${currentConvs.length} rooms`);
                currentConvs.forEach(conv => socket.emit('join_room', conv.id));
            }
            // Also rejoin the active conversation room explicitly
            if (activeConversationIdRef.current) {
                socket.emit('join_room', activeConversationIdRef.current);
            }
        };
        socket.on('connect', onSocketReconnect);
        
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
            socket.off('connect', onSocketReconnect);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected, user?.id]);

    // Phase 5.5: Lease-Aware Offline Queue Engine
    const offlineQueue = useMemo(() => {
        return new OfflineQueueEngine({
            getItem: (key: string) => localStorage.getItem(key),
            setItem: (key: string, value: string) => localStorage.setItem(key, value)
        });
    }, []);

    const flushQueue = useCallback(async () => {
        // ── CRITICAL FIX: Decouple message persistence from WebSocket connectivity ──
        // The HTTP POST to /messages must NOT wait for the realtime socket to connect.
        // The socket is only needed for live push notifications to OTHER users.
        // If we gate delivery on `connected`, messages never reach the server when
        // the gateway is sleeping (Render free tier), causing silent data loss.
        if (!session || !user) return;
        // Use refs so we always have the latest IDs without stale closures
        const currentDeviceId = deviceIdRef.current;
        const currentSessionId = sessionIdRef.current;
        if (!currentDeviceId || !currentSessionId) return;
        
        const intents = await offlineQueue.getPendingIntents();
        if (intents.length === 0) return;

        for (const intent of intents) {
            if (intent.status === 'sending' || intent.attempts >= 3) continue;

            await offlineQueue.updateIntentStatus(intent.event_id, 'sending');

            try {
                // Phase 5.5: Lease Barrier
                await ensureLeaseOwnership(
                    intent.conversation_id, 
                    currentSessionId, 
                    currentDeviceId, 
                    api, 
                    (cid: string) => leases[cid], 
                    markLeaseClaimEnd // Optional UI sync
                );

                const res = await api.post(`/chat/conversations/${intent.conversation_id}/messages`, {
                    content: intent.payload.content,
                    type: intent.payload.type,
                    attachmentId: intent.payload.attachmentId,
                    replyToId: intent.payload.replyTo?.id,
                    eventId: intent.event_id,
                    deviceId: currentDeviceId,
                    sessionId: currentSessionId
                });

                // Canonical backend collapse
                const backendMsg = res.data.message || res.data;
                let canonicalMessage: Message = { ...backendMsg, isOwn: true, status: 'sent' };

                // Guard: if the server didn't return a populated reply_to (FK join failed,
                // schema cache miss, or non-transactional path) but this intent had a
                // replyTo snapshot, fall back to the reply_to we already stored.
                // This prevents the reply bubble from disappearing on confirmation.
                if (intent.payload.replyTo && !canonicalMessage.reply_to) {
                    canonicalMessage = { ...canonicalMessage, reply_to: { 
                        id: intent.payload.replyTo.id,
                        content: intent.payload.replyTo.content ?? '',
                        sender_id: intent.payload.replyTo.sender_id ?? '',
                        type: intent.payload.replyTo.type ?? 'text'
                    } };
                }

                // Pre-register in dedup buffer BEFORE setMessages so that when the
                // gateway echo of this message arrives it is dropped cleanly.
                // We register both the canonical server id and the event_id so any
                // variation of the echo key is covered.
                if (canonicalMessage.id && !canonicalMessage.id.startsWith('temp-')) {
                    processedEventIdsRef.current.add(`id:${canonicalMessage.id}`);
                }
                if (canonicalMessage.event_id) {
                    processedEventIdsRef.current.add(`evt:${canonicalMessage.event_id}`);
                }
                // Also register the intent's client event_id for composite coverage
                processedEventIdsRef.current.add(`evt:${intent.event_id}`);

                if (import.meta.env.DEV) {
                    console.log('[SYNC_FORENSICS]', {
                        stage: 'flushQueue',
                        event: 'offline_queue_sync',
                        messageId: canonicalMessage.id,
                        eventId: intent.event_id,
                        incomingReplyTo: canonicalMessage.reply_to,
                        intentReplyTo: intent.payload.replyTo,
                        payload: canonicalMessage,
                    });
                }

                setMessages(prev => {
                    const current = prev[intent.conversation_id] || [];
                    const { merged } = mergeMessages(current, [canonicalMessage]);
                    return { ...prev, [intent.conversation_id]: merged as Message[] };
                });

                // Phase 4: Explicit Local Sync
                // Since the gateway purposefully excludes the sender from the broadcast
                // to prevent echo duplication, we must manually update the chat preview here.
                setConversations(cPrev => cPrev.map(conv => {
                    if (conv.id !== intent.conversation_id) return conv;
                    
                    const existingLastMsgTime = new Date(conv.lastMessage?.created_at ?? 0).getTime();
                    const newMsgTime = new Date(canonicalMessage.created_at).getTime();
                    
                    if (newMsgTime >= existingLastMsgTime) {
                        return {
                            ...conv,
                            updated_at: canonicalMessage.created_at,
                            last_message: { 
                                id: canonicalMessage.id, 
                                content: canonicalMessage.content, 
                                sender_id: canonicalMessage.sender_id, 
                                created_at: canonicalMessage.created_at,
                                type: canonicalMessage.type
                            },
                            lastMessage: { 
                                id: canonicalMessage.id, 
                                content: canonicalMessage.content, 
                                sender_id: canonicalMessage.sender_id, 
                                created_at: canonicalMessage.created_at,
                                type: canonicalMessage.type
                            }
                        };
                    }
                    return conv;
                }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));

                await offlineQueue.removeIntent(intent.event_id);
            } catch (err) {
                console.error('[ChatContext] Failed to flush intent', intent.event_id, err);
                await offlineQueue.updateIntentStatus(intent.event_id, 'failed');
                // Revert optimistic UI status to failed
                setMessages(prev => {
                    const current = prev[intent.conversation_id] || [];
                    return {
                        ...prev,
                        [intent.conversation_id]: current.map(m => m.id === intent.event_id || m.event_id === intent.event_id ? { ...m, status: 'failed' } : m)
                    };
                });
            }
        }
    }, [session, user, offlineQueue, leases, markLeaseClaimEnd]);

    // Process Outbox:
    // 1. Immediately when the user session becomes ready (catches the case where
    //    the gateway is sleeping — messages still fire via HTTP POST).
    // 2. Again whenever the socket connects/reconnects (fast-path for online users).
    useEffect(() => {
        if (session && user) flushQueue();
    }, [session, user, flushQueue]);

    useEffect(() => {
        if (connected) flushQueue();
    }, [connected, flushQueue]);

    const sendMessageToConversation = async (payload: { conversationId: string; content: string; type?: string; attachmentId?: string; replyTo?: { id: string; content: string; sender_id: string; type?: string } }) => {
        const { conversationId, content, type = 'text', attachmentId, replyTo } = payload;
        if (!session || !user) throw new Error('Cannot send message: not authenticated');

        // Ensure device/session IDs are ready. If initSession is still in-flight,
        // await it instead of throwing immediately (fixes the race condition).
        let resolvedDeviceId = deviceIdRef.current;
        let resolvedSessionId = sessionIdRef.current;

        if (!resolvedDeviceId || !resolvedSessionId) {
            if (sessionInitPromiseRef.current) {
                resolvedSessionId = await sessionInitPromiseRef.current;
                resolvedDeviceId = deviceIdRef.current;
            }

            // Final fallback: re-register on demand if still missing
            if (!resolvedDeviceId || !resolvedSessionId) {
                let localDeviceId = localStorage.getItem('chat_device_id');
                if (!localDeviceId) {
                    localDeviceId = `web-${Math.random().toString(36).substring(2, 9)}`;
                    localStorage.setItem('chat_device_id', localDeviceId);
                    setDeviceId(localDeviceId);
                    deviceIdRef.current = localDeviceId;
                }
                resolvedDeviceId = localDeviceId;

                try {
                    const res = await api.post('/session/register', {
                        userId: user.id,
                        deviceId: localDeviceId,
                        userAgent: navigator.userAgent
                    }, {
                        headers: { Authorization: `Bearer ${session.access_token}` }
                    });
                    if (res.data?.session_id) {
                        resolvedSessionId = res.data.session_id;
                        setSessionId(resolvedSessionId!);
                        sessionIdRef.current = resolvedSessionId;
                    }
                } catch (err) {
                    console.error('[ChatContext] On-demand session registration failed', err);
                }
            }

            if (!resolvedDeviceId || !resolvedSessionId) {
                // Do NOT throw — that blocks the message entirely on iOS Safari after
                // a cold-start or network flap. Instead, degrade gracefully:
                // generate ephemeral IDs so the message still queues and sends.
                // Lease arbitration runs in degraded (non-arbitrated) mode but the
                // content always reaches the server.
                console.warn('[ChatContext] Session not ready — proceeding with ephemeral session (degraded mode)');
                if (!resolvedDeviceId) {
                    resolvedDeviceId = `web-${Math.random().toString(36).substring(2, 9)}`;
                    localStorage.setItem('chat_device_id', resolvedDeviceId);
                    deviceIdRef.current = resolvedDeviceId;
                }
                if (!resolvedSessionId) {
                    resolvedSessionId = `eph-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                }
            }
        }
        
        // Phase 5: Soft Override Claim UI Hint
        if (!isActiveWriter(conversationId)) {
            markLeaseClaimStart(conversationId);
            toast('Switching chat control to this device...', { icon: '🔄', id: 'lease_claim' });
        }



        // Generate Canonical Event ID
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const clientEventId = crypto.randomUUID();

        const optimisticMessage: Message = {
            id: tempId,
            event_id: clientEventId,
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            created_at: new Date().toISOString(),
            type: (type || 'text') as Message['type'],
            isOwn: true,
            status: 'sending',
            reply_to: replyTo ? { ...replyTo, type: replyTo.type ?? 'text' } : undefined
        };
        
        setMessages(prev => {
            const current = prev[conversationId] || [];
            const { merged } = mergeMessages(current, [optimisticMessage]);
            return { ...prev, [conversationId]: merged as Message[] };
        });

        // 1. Push Intent to Offline Queue
        await offlineQueue.pushIntent({
            event_id: clientEventId,
            conversation_id: conversationId,
            payload: { content, type, attachmentId, replyTo },
            leaseSnapshot: { device_id: resolvedDeviceId, session_id: resolvedSessionId },
            created_at: Date.now()
        });

        // 2. Trigger Queue Flush
        flushQueue();
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

        // Phase 5: Soft Override Claim
        if (!isActiveWriter(conversationId)) {
            markLeaseClaimStart(conversationId);
            toast('Switching chat control to this device...', { icon: '🔄', id: 'lease_claim' });
        }

        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const clientEventId = crypto.randomUUID();
        const fileName = (file as File).name || `audio_${Date.now()}.webm`;
        const fileSize = file.size;
        const fileType = file.type;

        // 1. Generate local blob/object URL for instant rendering
        const localUrl = URL.createObjectURL(file);

        // 2. Build and insert optimistic message
        const optimisticMessage: Message = {
            id: tempId,
            event_id: clientEventId,
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
            const { merged } = mergeMessages(current, [optimisticMessage]);
            return { ...prev, [conversationId]: merged as Message[] };
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

                // Bypass Supabase JS SDK to prevent RLS failures due to custom backend tokens
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
                const uploadUrl = `${supabaseUrl}/storage/v1/object/chat-media/${filePath}`;
                
                const res = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                        'Content-Type': (fileType ? fileType.split(';')[0] : (type === 'audio' ? 'audio/webm' : 'application/octet-stream')),
                        'x-upsert': 'false'
                    },
                    body: file, // Works with File or Blob natively in browser
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Storage upload failed: ${errorText}`);
                }

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
                    attachmentId: attachment.id,
                    eventId: clientEventId,
                    deviceId,
                    sessionId
                });

                // Phase 3.2: Use merge engine to replace optimistic message
                const canonicalMessage = { ...msgRes.data, isOwn: true, status: 'sent' };
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    const { merged } = mergeMessages(current, [canonicalMessage]);
                    return { ...prev, [conversationId]: merged as Message[] };
                });

                // Explicit Local Sync for Media
                setConversations(cPrev => cPrev.map(conv => {
                    if (conv.id !== conversationId) return conv;
                    
                    const existingLastMsgTime = new Date(conv.lastMessage?.created_at ?? 0).getTime();
                    const newMsgTime = new Date(canonicalMessage.created_at).getTime();
                    
                    if (newMsgTime >= existingLastMsgTime) {
                        return {
                            ...conv,
                            updated_at: canonicalMessage.created_at,
                            last_message: { 
                                id: canonicalMessage.id, 
                                content: canonicalMessage.content, 
                                sender_id: canonicalMessage.sender_id, 
                                created_at: canonicalMessage.created_at,
                                type: canonicalMessage.type
                            },
                            lastMessage: { 
                                id: canonicalMessage.id, 
                                content: canonicalMessage.content, 
                                sender_id: canonicalMessage.sender_id, 
                                created_at: canonicalMessage.created_at,
                                type: canonicalMessage.type
                            }
                        };
                    }
                    return conv;
                }));

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
    }, [activeConversationId, session, user, isActiveWriter, markLeaseClaimStart, deviceId, sessionId]);

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
        sendMessage: (payload) => sendMessageToConversation({ conversationId: activeConversationId!, ...payload }),
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
        markConversationRead, markConversationDelivered,
        isActiveWriter, isClaimingLease,
        onMessageVisible: (conversationId: string, messageId: string) => readReceiptEngine.onMessageVisible(conversationId, messageId),
        clearState,
        initialize
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
