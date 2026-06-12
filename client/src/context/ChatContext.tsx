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
import { generateCorrelationId, trackCorrelation, completeCorrelation } from '../lib/correlationId';
import { logger } from '../lib/logger';
import { ChatBootKernel } from './ChatBootKernel';

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

// ── SINGLE CANONICAL DEDUPE RULE: event_id OR id ───────────────────────────
// This is the ONE merge system used everywhere in the app.
// Rule: A message is unique if event_id OR id matches — never both independently.
function dedupeMessages(messages: Message[]): Message[] {
    const map = new Map<string, Message>();
    for (const m of messages) {
        const key = m.event_id || m.id;
        // Later entries for the same key win (preserves status upgrades)
        map.set(key, m);
    }
    return Array.from(map.values())
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

// Alias for merge-and-dedupe of two arrays (replaces stableMerge calls)
function stableMerge(prev: Message[], incoming: Message[]): Message[] {
    return dedupeMessages([...prev, ...incoming]);
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

const STATUS_PRIORITY: Record<string, number> = {
    'sending': 0,
    'failed': 0,
    'sent': 1,
    'delivered': 2,
    'read': 3
};

// Helper: Enforce precedence so a message never downgrades its delivery status
// Priority: read > delivered > sent
const mergeMessageStatus = (oldMsg: Message, newMsg: Partial<Message>): Message => {
    let finalStatus = newMsg.status || oldMsg.status;
    
    // Explicit string status priority
    if (oldMsg.status && newMsg.status) {
        if ((STATUS_PRIORITY[oldMsg.status] || 0) > (STATUS_PRIORITY[newMsg.status] || 0)) {
            finalStatus = oldMsg.status;
        }
    }

    return {
        ...oldMsg,
        ...newMsg,
        status: finalStatus,
        // If old message had read_at, preserve it unless new message also has it
        read_at: newMsg.read_at || oldMsg.read_at,
        // If old message had delivered_at, preserve it unless new message also has it
        delivered_at: newMsg.delivered_at || oldMsg.delivered_at,
    };
};

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, session, authReady, isSwitching } = useAuth();
    const { socket, connected, initialize: connectSocket } = useSocket();
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


    const pendingDeliveryAcksRef = useRef<Set<string>>(new Set());
    const sentBatchAckIdsRef = useRef<Set<string>>(new Set()); // Dedup window for batch ACKs
    // Single Writer dedup gate: tracks which tick level has already been applied per messageId.
    // Prevents the 6-event collision storm from causing redundant state updates + React re-renders.
    // Values: Set containing 'delivered' | 'read' — once 'read' is in the set, nothing can write.
    const appliedTicksRef = useRef<Map<string, Set<string>>>(new Map());
    const isReconnectingRef = useRef<boolean>(false);
    const reconnectBufferRef = useRef<unknown[]>([]);
    const reconcilingRef = useRef<boolean>(false); // Overlap lock for reconciliation
    const lastServerAckRef = useRef<number>(Date.now()); // Tracks last real event from server
    // Stable ref to loadMessages — avoids TDZ when the reconciliation useEffect is declared
    // above the loadMessages useCallback. Synced after loadMessages is initialized.
    const loadMessagesRef = useRef<(conversationId: string, force?: boolean) => Promise<void>>(() => Promise.resolve());

    // Tab-primary singleton: Only one tab runs ACK batching, reconciliation and heartbeat.
    // Uses a localStorage lease refreshed every 4s. Other tabs detect staleness (>6s).
    const TAB_ID = useRef<string>(crypto.randomUUID());
    const isPrimaryTabRef = useRef<boolean>(false);
    useEffect(() => {
        const TAB_LEASE_KEY = 'chat_primary_tab_lease';
        const TAB_LEASE_TTL = 6000;
        const claimLease = () => {
            const stored = localStorage.getItem(TAB_LEASE_KEY);
            if (stored) {
                try {
                    const { id, ts } = JSON.parse(stored);
                    const isStale = Date.now() - ts > TAB_LEASE_TTL;
                    if (!isStale && id !== TAB_ID.current) {
                        isPrimaryTabRef.current = false;
                        return;
                    }
                } catch { /* corrupt entry — take over */ }
            }
            localStorage.setItem(TAB_LEASE_KEY, JSON.stringify({ id: TAB_ID.current, ts: Date.now() }));
            isPrimaryTabRef.current = true;
        };
        claimLease();
        const leaseInterval = setInterval(claimLease, 4000);
        return () => clearInterval(leaseInterval);
    }, []);

    // Layer 3: Batch ACK Engine — primary tab only, with dedup window
    useEffect(() => {
        if (!user || !session) return;
        const interval = setInterval(() => {
            if (!isPrimaryTabRef.current) return; // Only primary tab flushes to DB
            const currentAcks = pendingDeliveryAcksRef.current;
            if (currentAcks.size > 0) {
                // Deduplicate: remove any IDs already sent in a recent batch
                const newIds = Array.from(currentAcks).filter(id => !sentBatchAckIdsRef.current.has(id));
                pendingDeliveryAcksRef.current = new Set();
                if (newIds.length > 0) {
                    newIds.forEach(id => sentBatchAckIdsRef.current.add(id));
                    // Bound the sent-set so it doesn't grow indefinitely
                    if (sentBatchAckIdsRef.current.size > 2000) sentBatchAckIdsRef.current.clear();
                    api.patch('/chat/messages/ack:batch', { messageIds: newIds })
                       .catch(err => console.error('[ACK Engine] Failed to batch ACK', err));
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [user, session]);

    // Layer 5: Silent Drift Reconciliation Safety Net — with overlap lock + drift detection
    useEffect(() => {
        if (!user || !session) return;
        const interval = setInterval(async () => {
            if (!isPrimaryTabRef.current) return;
            if (reconcilingRef.current) {
                console.log('[Reconciliation Engine] Skipping — previous sync still in-flight');
                return;
            }
            const convId = activeConversationIdRef.current;
            if (!convId || !isMounted.current) return;

            const socketAge = Date.now() - lastServerAckRef.current;
            const reason = socketAge > 30000 ? 'silent-drift' : 'periodic-safety-net';
            console.log(`[Reconciliation Engine] [${reason}] syncing ${convId}`);

            reconcilingRef.current = true;
            try {
                // Use ref to avoid TDZ (loadMessages is declared after this effect)
                await loadMessagesRef.current(convId, true);
            } catch (err) {
                console.warn('[Reconciliation Engine] Periodic sync failed', err);
            } finally {
                reconcilingRef.current = false;
            }
        }, 60000);
        return () => clearInterval(interval);
    // loadMessages intentionally omitted — accessed via loadMessagesRef to avoid TDZ
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, session]);

    // Flight Recorder
    useEffect(() => {
        if (!user || !session || !import.meta.env.DEV) return;
        const interval = setInterval(() => {
            const activeConvId = activeConversationIdRef.current;
            console.log(`[RELIABILITY_STATE]`, {
                socketStatus: connected ? 'CONNECTED' : (isReconnectingRef.current ? 'RECONNECTING' : 'DISCONNECTED'),
                bufferSize: reconnectBufferRef.current.length,
                pendingAcks: pendingDeliveryAcksRef.current.size,
                lastServerAckMs: Date.now() - lastServerAckRef.current,
                isPrimaryTab: isPrimaryTabRef.current,
                isReconciling: reconcilingRef.current,
                lastReconciliation: activeConvId ? (messagesCachedAtRef.current[activeConvId] || null) : null
            });
        }, 10000);
        return () => clearInterval(interval);
    }, [user, session, connected]);

    // Chat Boot Kernel: Deterministic State Machine Orchestrator
    useEffect(() => {
        if (!authReady || !user?.id || !session?.access_token) return;

        const kernel = ChatBootKernel.getInstance();

        const registerSession = async (): Promise<string | null> => {
            let localDeviceId = localStorage.getItem('chat_device_id');
            if (!localDeviceId) {
                localDeviceId = `web-${Math.random().toString(36).substring(2, 9)}`;
                localStorage.setItem('chat_device_id', localDeviceId);
            }
            setDeviceId(localDeviceId);
            deviceIdRef.current = localDeviceId;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const res = await api.post('/session/register', {
                        userId: user.id,
                        deviceId: localDeviceId,
                        userAgent: navigator.userAgent
                    }, {
                        headers: { Authorization: `Bearer ${session.access_token}` }
                    });
                    if (res.data?.session_id) {
                        const sid = res.data.session_id;
                        if (isMounted.current) {
                            setSessionId(sid);
                            sessionIdRef.current = sid;
                        }
                        return sid;
                    }
                } catch (err: unknown) {
                    console.error(`[ChatContext] Session registration attempt ${attempt}/3 failed`, err);
                }
                if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500));
            }
            return null;
        };

        kernel.boot(user.id, {
            registerSession,
            connectSocket: async () => {
                await connectSocket(session.access_token);
            },
            loadConversations,
            hydrateIntents: async () => {
                // Pending intents are currently hydrated automatically at the end 
                // of loadConversations and loadMessages. This fulfills the contract.
                return Promise.resolve();
            }
        });

    // NOTE: Intentionally keying boot ONLY on user.id to prevent object identity 
    // drift from triggering StrictMode re-mount chaos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, user?.id]);


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
    // ── GLOBAL SOCKET DEDUP GUARD ──────────────────────────────────────────────
    // A single global Set keyed by (event_id || id) that gates every incoming
    // socket message BEFORE it reaches setMessages. Prevents flicker from duplicate
    // socket delivers (re-emits, recheck, multi-device broadcasts of the same message).
    const seenMessagesRef = useRef<Set<string>>(new Set());
    // ── RECONNECT SYNC TIMESTAMP ───────────────────────────────────────────────
    // Tracks the created_at of the last message we successfully received.
    // Used as the `since` cursor in the reconnect sync API call.
    const lastSyncTimestampRef = useRef<string>(new Date(Date.now() - 30000).toISOString());
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
            console.log(`[FORENSIC][CLIENT] Read ACK Sent | messageId: ${messageId} | conversationId: ${conversationId} | timestamp: ${now}`);
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
            console.log(`[FORENSIC][CLIENT] Delivery ACK Sent | messageId: ${messageId} | conversationId: ${conversationId} | timestamp: ${now}`);
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

        // CRITICAL: Always fire the API so the server emits chat:conversation_read to the sender.
        // This is what triggers the blue double-tick on the sender's screen.
        // Previously this was gated behind unreadCount > 0 which meant:
        //   - If receiver opened chat with 0 unread (first visit), no API call was made
        //   - Server never knew the message was read → no chat:conversation_read event → no blue ticks
        // The API call is fire-and-forget — it's cheap (the server deduplicates via read_at IS NULL).
        api.put(`/chat/conversations/${conversationId}/read`, { deviceId }).catch(err => {
            console.error('[Chat] Failed to mark conversation read:', err);
        });

        // Only update local unread count if it's actually > 0 to avoid unnecessary re-renders
        setConversations(prev => {
            const conv = prev.find(c => c.id === conversationId);
            if (!conv || conv.unreadCount === 0) return prev; // No-op, preserves array reference
            return prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c);
        });
    }, [session, deviceId]);

    const joinAllRooms = useCallback((convList: Conversation[]) => {
        const s = socketRef.current;
        if (!s || !s.connected || convList.length === 0) return;
        convList.forEach(conv => s.emit('join_room', conv.id));
    }, []);

    const loadConversations = useCallback(async () => {
        console.log('[CHAT] loadConversations started');
        if (!session || isSwitching || conversationsFetchRef.current) {
            console.log(`[CHAT] loadConversations aborted: session=${!!session}, isSwitching=${isSwitching}, fetching=${conversationsFetchRef.current}`);
            return;
        }
        conversationsFetchRef.current = true;
        try {
            const response = await api.get('/chat/conversations');
            const data = response.data;
            console.log('[CHAT] conversations loaded', data?.length);
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
            console.error('[CHAT] loadConversations failed', e);
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
                const rawIntents = await offlineQueueEngine.getPendingIntents();
                // Deduplicate by event_id to prevent intent re-hydration duplication risk
                const pendingIntents = Array.from(new Map(rawIntents.map(i => [i.event_id, i])).values());
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
                    const rawIntents = await offlineQueueEngine.getPendingIntents();
                    // Deduplicate by event_id to prevent intent re-hydration duplication risk
                    const pendingIntents = Array.from(new Map(rawIntents.map(i => [i.event_id, i])).values());
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

    // Keep the ref synced so periodic reconciliation doesn't hit a TDZ
    useEffect(() => {
        loadMessagesRef.current = loadMessages;
    }, [loadMessages]);

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
        // Clear tick dedup gate so new account starts fresh
        appliedTicksRef.current = new Map();
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
    // NOTE: loadConversations is excluded so it doesn't trigger on session refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, user?.id, clearState]);

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

    // Maintain refs to latest dependencies to avoid stale closures in socket handlers
    const sessionRef = useRef(session);
    useEffect(() => { sessionRef.current = session; }, [session]);

    // Listen for Service Worker push relay: when a push arrives while the user is in the
    // chat room, the SW suppresses the visible notification but posts CHAT_MESSAGE_RECEIVED
    // here so we immediately call markConversationRead → blue tick fires for the sender.
    const markConversationReadRef = useRef(markConversationRead);
    useEffect(() => { markConversationReadRef.current = markConversationRead; }, [markConversationRead]);

    useEffect(() => {
        const handleSWMessage = (event: MessageEvent) => {
            if (event.data?.type === 'CHAT_MESSAGE_RECEIVED') {
                const { conversationId } = event.data;
                if (conversationId) {
                    console.log(`[SW→Chat] CHAT_MESSAGE_RECEIVED | conv:${conversationId} → firing markConversationRead`);
                    markConversationReadRef.current(conversationId);
                }
            }
        };
        navigator.serviceWorker?.addEventListener('message', handleSWMessage);
        return () => {
            navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
        };
    }, []);

    useEffect(() => {
        console.log(`[SYNC_FORENSICS] ChatContext socket effect evaluated | socket exists: ${!!socket} | connected: ${connected}`);
        if (!socket || !connected) return;

        const processIncomingMessage = (raw: unknown) => {
            // Narrow to Message-shape for reconnect buffer (safe — validated below)
            const rawMsg = raw as { id?: string };
            if (isReconnectingRef.current) {
                console.log(`[CLIENT_TRACE] Reconnection buffer active. Queuing incoming message: ${rawMsg?.id}`);
                reconnectBufferRef.current.push(raw);
                if (reconnectBufferRef.current.length > 500) {
                    reconnectBufferRef.current.shift();
                }
                return;
            }
            if (!isMounted.current || !sessionRef.current) {
                console.log(`[CLIENT_TRACE] processIncomingMessage DROPPED (Not mounted or session=null in ref)`);
                return;
            }
            // Stamp last server event time for silent-drift detection
            lastServerAckRef.current = Date.now();

            const validation = validateMessagePayload(raw);
            if (!validation.valid) {
                console.log(`[SYNC_FORENSICS] [CLIENT_TRACE] schema validation: FAIL | reason: ${validation.reason}`);
                return;
            }
            const msg = validation.data as Message & { is_deleted?: boolean };

            console.log(`[FORENSIC][CLIENT] Message Received | messageId: ${msg.id} | conversationId: ${msg.conversation_id} | senderId: ${msg.sender_id} | timestamp: ${Date.now()}`);
            console.log(`[SYNC_FORENSICS] [CLIENT_TRACE] [${Date.now()}] chat:message received | id: ${msg.id} | convId: ${msg.conversation_id} | activeConvId: ${activeConversationIdRef.current}`);

            // ── GLOBAL SEEN CACHE GUARD ──────────────────────────────────────
            // Single-pass gate using dedupeMessages canonical key (event_id || id).
            // Must run BEFORE any state updates to prevent socket double-inserts.
            const seenKey = msg.event_id || msg.id;
            if (seenMessagesRef.current.has(seenKey)) {
                console.log(`[CLIENT_TRACE] seenMessages guard: DROPPED | key: ${seenKey}`);
                return;
            }
            seenMessagesRef.current.add(seenKey);
            // Bound the set to prevent memory leaks (cap at 3000 entries)
            if (seenMessagesRef.current.size > 3000) {
                const first = seenMessagesRef.current.values().next().value;
                if (first !== undefined) seenMessagesRef.current.delete(first);
            }

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
            const isOwnMessage = msg.sender_id === user?.id;
            if (isOwnMessage) {
                // Drop echo completely to prevent double updates.
                return;
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

            // ── Update lastSyncTimestamp to the newest message we've processed
            if (msg.created_at > lastSyncTimestampRef.current) {
                lastSyncTimestampRef.current = msg.created_at;
            }

            // PERF FIX: Replace per-message HTTP calls with debounced conversation-level read.
            if (!isOwnMessage) {
                // 1. Immediate ACK (Layer 3 - UX correctness)
                socket.emit('chat:delivered', {
                    conversationId: msg.conversation_id,
                    messageId: msg.id,
                    eventId: msg.event_id,
                    deliveredAt: new Date().toISOString()
                });

                // 2. Queue for Batch ACK (Layer 3 - Network efficiency)
                pendingDeliveryAcksRef.current.add(msg.id);

                // Debounced: fires at most once per 1.5s per conversation for read status
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
                const merged = dedupeMessages([...current, safeNewMessage]);
                console.log(`[CLIENT_TRACE] [${Date.now()}] messages state updated: PASS | next state size: ${merged.length}`);
                return { ...prev, [msg.conversation_id]: merged };
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

        // PRIMARY WRITER — Delivery
        const onDeliveryEvent = ({ messageId, eventId, conversationId }: { messageId: string; eventId?: string; conversationId: string }) => {
            if (!isMounted.current || (!messageId && !eventId) || !conversationId) return;

            const currentMsgs = messagesRef.current[conversationId] || [];
            const targetMsg = currentMsgs.find(m => (messageId && m.id === messageId) || (eventId && m.event_id === eventId));
            if (!targetMsg) return;

            const trackId = targetMsg.id;

            // Dedup gate: skip if this message is already at 'delivered' or 'read'
            const tickSet = appliedTicksRef.current.get(trackId);
            if (tickSet && (tickSet.has('delivered') || tickSet.has('read'))) return;
            const nextSet = tickSet || new Set<string>();
            nextSet.add('delivered');
            appliedTicksRef.current.set(trackId, nextSet);
            // Bound map size to prevent memory leak in long-lived sessions
            if (appliedTicksRef.current.size > 5000) {
                const firstKey = appliedTicksRef.current.keys().next().value;
                if (firstKey !== undefined) appliedTicksRef.current.delete(firstKey);
            }

            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        m.id === trackId ? mergeMessageStatus(m, { delivered_at: nowStr, status: 'delivered' }) : m
                    )
                };
            });
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage?.id === trackId) {
                    return { ...c, lastMessage: mergeMessageStatus(c.lastMessage as Message, { delivered_at: nowStr, status: 'delivered' }) as Conversation['lastMessage'] };
                }
                return c;
            }));
        };

        // PRIMARY WRITER — Read (single message)
        const onReadEvent = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
            if (!isMounted.current || !messageId || !conversationId) return;

            // Dedup gate: skip if already marked read
            const tickSet = appliedTicksRef.current.get(messageId);
            if (tickSet?.has('read')) return;
            const nextSet = tickSet || new Set<string>();
            nextSet.add('read');
            nextSet.add('delivered'); // read implies delivered
            appliedTicksRef.current.set(messageId, nextSet);

            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                if (!current.some(m => m.id === messageId)) return prev;
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        m.id === messageId ? mergeMessageStatus(m, { read_at: nowStr, delivered_at: nowStr, status: 'read' }) : m
                    )
                };
            });
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage?.id === messageId) {
                    return { ...c, lastMessage: mergeMessageStatus(c.lastMessage as Message, { read_at: nowStr, delivered_at: nowStr, status: 'read' }) as Conversation['lastMessage'] };
                }
                return c;
            }));
        };

        // PRIMARY WRITER — Read (batch, from GW relay)
        const onBatchReadEvent = ({ conversationId, messageIds }: { conversationId: string; messageIds: string[] }) => {
            if (!isMounted.current || !Array.isArray(messageIds) || messageIds.length === 0) return;

            // Dedup gate: filter to only IDs not yet marked read
            const newIds = messageIds.filter(id => {
                const tickSet = appliedTicksRef.current.get(id);
                if (tickSet?.has('read')) return false;
                const nextSet = tickSet || new Set<string>();
                nextSet.add('read');
                nextSet.add('delivered');
                appliedTicksRef.current.set(id, nextSet);
                return true;
            });
            if (newIds.length === 0) return; // all already applied — skip entire state update

            const nowStr = new Date().toISOString();
            setMessages(prev => {
                const current = prev[conversationId] || [];
                const hasAny = current.some(m => newIds.includes(m.id));
                if (!hasAny) return prev;
                return {
                    ...prev,
                    [conversationId]: current.map(m =>
                        newIds.includes(m.id) ? mergeMessageStatus(m, { read_at: nowStr, delivered_at: nowStr, status: 'read' }) : m
                    )
                };
            });
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage && newIds.includes(c.lastMessage.id)) {
                    return { ...c, lastMessage: mergeMessageStatus(c.lastMessage as Message, { read_at: nowStr, delivered_at: nowStr, status: 'read' }) as Conversation['lastMessage'] };
                }
                return c;
            }));
        };

        // GATED WRITER — Conversation Delivered
        const onConversationDelivered = ({ conversationId, userId, delivered_at }: { conversationId: string; userId: string; delivered_at: string }) => {
            if (!isMounted.current || userId === user?.id) return;
            const nowStr = delivered_at || new Date().toISOString();

            setMessages(prev => {
                const current = prev[conversationId] || [];
                if (current.length === 0) return prev;
                let changed = false;
                const updated = current.map(m => {
                    if (m.sender_id !== user?.id) return m;
                    if (m.read_at) return m; // already at higher state — skip
                    // Dedup gate per-message
                    const tickSet = appliedTicksRef.current.get(m.id);
                    if (tickSet?.has('delivered') || tickSet?.has('read')) return m;
                    const nextSet = tickSet || new Set<string>();
                    nextSet.add('delivered');
                    appliedTicksRef.current.set(m.id, nextSet);
                    changed = true;
                    return mergeMessageStatus(m, { delivered_at: nowStr, status: 'delivered' });
                });
                return changed ? { ...prev, [conversationId]: updated } : prev;
            });
            // Also update lastMessage summary
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId && c.lastMessage?.sender_id === user?.id && !c.lastMessage?.read_at) {
                    return { ...c, lastMessage: mergeMessageStatus(c.lastMessage as Message, { delivered_at: nowStr, status: 'delivered' }) as Conversation['lastMessage'] };
                }
                return c;
            }));
        };

        // GATED WRITER — Conversation Read
        const onConversationRead = ({ conversationId, readerId, readAt }: { conversationId: string; readerId: string; readAt: string }) => {
            if (!isMounted.current) return;
            if (readerId !== user?.id) {
                const nowStr = readAt || new Date().toISOString();
                // Update all of the current user's sent messages to 'read' via gate
                setMessages(prev => {
                    const current = prev[conversationId] || [];
                    if (current.length === 0) return prev;
                    let changed = false;
                    const updated = current.map(m => {
                        if (m.sender_id !== user?.id) return m;
                        // Dedup gate — skip if already at 'read'
                        const tickSet = appliedTicksRef.current.get(m.id);
                        if (tickSet?.has('read')) return m;
                        const nextSet = tickSet || new Set<string>();
                        nextSet.add('read');
                        nextSet.add('delivered');
                        appliedTicksRef.current.set(m.id, nextSet);
                        changed = true;
                        return mergeMessageStatus(m, { read_at: nowStr, delivered_at: nowStr, status: 'read' });
                    });
                    return changed ? { ...prev, [conversationId]: updated } : prev;
                });
                // Update lastMessage summary
                setConversations(prev => prev.map(c => {
                    if (c.id === conversationId && c.lastMessage?.sender_id === user?.id) {
                        return { ...c, lastMessage: mergeMessageStatus(c.lastMessage as Message, { read_at: readAt, delivered_at: readAt, status: 'read' }) as Conversation['lastMessage'] };
                    }
                    return c;
                }));
            } else {
                // Current user read from another device — clear unread count only
                setConversations(prev => prev.map(c => {
                    if (c.id === conversationId) {
                        return {
                            ...c,
                            unreadCount: 0,
                            lastMessage: c.lastMessage && c.lastMessage.sender_id !== user?.id
                                ? { ...c.lastMessage, read_at: readAt }
                                : c.lastMessage
                        };
                    }
                    return c;
                }));
            }
        };


        // Non-tick observer: member status/presence updates within a conversation
        const onConversationUpdated = ({ conversationId, userId, status }: { conversationId: string; userId: string; status: string }) => {
            if (!isMounted.current) return;
            setConversations(prev => prev.map(c => {
                if (c.id === conversationId) {
                    return { ...c, members: c.members.map(m => m.user_id === userId ? { ...m, status } : m) };
                }
                return c;
            }));
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
        
        // Layer 5: Reconciliation Engine Trigger (Tab Visibility)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && activeConversationIdRef.current) {
                console.log(`[Reconciliation Engine] Tab visible, syncing ${activeConversationIdRef.current}`);
                loadMessages(activeConversationIdRef.current, true).catch(err => 
                    console.warn('[Reconciliation Engine] Failed to reconcile on visibility change', err)
                );
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        socket.off('chat:message', processIncomingMessage);
        socket.on('chat:message', processIncomingMessage);

        socket.off('chat:message_deleted', onMessageDeleted);
        socket.on('chat:message_deleted', onMessageDeleted);

        socket.off('chat:message_edited', onMessageEdited);
        socket.on('chat:message_edited', onMessageEdited);

        socket.off('chat:message_delivered', onDeliveryEvent);
        socket.on('chat:message_delivered', onDeliveryEvent);

        socket.off('chat:delivery_receipt', onDeliveryEvent);
        socket.on('chat:delivery_receipt', onDeliveryEvent);

        socket.off('chat:message_read', onReadEvent);
        socket.on('chat:message_read', onReadEvent);

        socket.off('chat:read_receipt', onBatchReadEvent);
        socket.on('chat:read_receipt', onBatchReadEvent);

        socket.off('chat:conversation_updated', onConversationUpdated);
        socket.on('chat:conversation_updated', onConversationUpdated);

        socket.off('chat:conversation_read', onConversationRead);
        socket.on('chat:conversation_read', onConversationRead);

        socket.off('chat:conversation_delivered', onConversationDelivered);
        socket.on('chat:conversation_delivered', onConversationDelivered);

        socket.off('chat:typing', onTyping);
        socket.on('chat:typing', onTyping);

        // Re-join ALL conversation rooms on every socket reconnect.
        const onSocketReconnect = async () => {
            isReconnectingRef.current = false;
            
            // Flush reconnection buffer
            if (reconnectBufferRef.current.length > 0) {
                console.log(`[ChatContext] Flushing ${reconnectBufferRef.current.length} buffered messages after reconnect`);
                reconnectBufferRef.current.forEach(msg => processIncomingMessage(msg));
                reconnectBufferRef.current = [];
            }

            const currentConvs = conversationsRef.current;
            if (currentConvs.length > 0) {
                console.log(`[ChatContext] 🔄 Socket reconnected — re-joining ${currentConvs.length} rooms`);
                currentConvs.forEach(conv => socket.emit('join_room', conv.id));
            }
            // Also rejoin the active conversation room explicitly
            if (activeConversationIdRef.current) {
                socket.emit('join_room', activeConversationIdRef.current);
                
                // Layer 5: Reconciliation Engine Trigger (Socket Reconnect)
                // Force sync the active chat to catch any messages missed during the drop
                loadMessages(activeConversationIdRef.current, true).catch(err => 
                    console.warn('[Reconciliation Engine] Failed to reconcile on reconnect', err)
                );
            }
        };
        
        // Layer 3 Reconnection buffer: 
        // When transport drops, block new messages briefly until re-synchronized
        const onSocketDisconnect = () => {
            isReconnectingRef.current = true;
        };

        socket.off('connect', onSocketReconnect);
        socket.on('connect', onSocketReconnect);
        
        socket.off('disconnect', onSocketDisconnect);
        socket.on('disconnect', onSocketDisconnect);
        
        return () => { 
            socket.off('chat:message', processIncomingMessage); 
            socket.off('chat:message_deleted', onMessageDeleted);
            socket.off('chat:message_edited', onMessageEdited);
            socket.off('chat:message_delivered', onDeliveryEvent);
            socket.off('chat:delivery_receipt', onDeliveryEvent);
            socket.off('chat:message_read', onReadEvent);
            socket.off('chat:read_receipt', onBatchReadEvent);
            socket.off('chat:conversation_updated', onConversationUpdated);
            socket.off('chat:conversation_read', onConversationRead);
            socket.off('chat:conversation_delivered', onConversationDelivered);
            socket.off('chat:typing', onTyping);
            socket.off('connect', onSocketReconnect);
            socket.off('disconnect', onSocketDisconnect);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, user?.id]);

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
        
        const rawIntents = await offlineQueue.getPendingIntents();
        if (rawIntents.length === 0) return;
        // FIFO guarantee: always flush oldest intent first to preserve message ordering
        const intents = [...rawIntents].sort((a, b) => a.created_at - b.created_at);

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

                if (intent.payload.correlationId) {
                    logger.debug('API', 'Flushing message intent', { correlationId: intent.payload.correlationId, eventId: intent.event_id });
                }
                const res = await api.post(`/chat/conversations/${intent.conversation_id}/messages`, {
                    content: intent.payload.content,
                    type: intent.payload.type,
                    attachmentId: intent.payload.attachmentId,
                    replyToId: intent.payload.replyTo?.id,
                    eventId: intent.event_id,
                    deviceId: currentDeviceId,
                    sessionId: currentSessionId
                }, {
                    headers: intent.payload.correlationId ? { 'X-Correlation-ID': intent.payload.correlationId } : undefined
                });
                
                if (intent.payload.correlationId) {
                    completeCorrelation(intent.payload.correlationId);
                }

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
                    const merged = stableMerge(current, [canonicalMessage]);
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

            // If still missing after awaiting init promise, reject strictly.
            // Do NOT re-register here — that creates new session IDs and causes
            // the session churn bug (multiple IDs for the same tab/user).
            if (!resolvedDeviceId || !resolvedSessionId) {
                console.error('[ChatContext] Session not ready — rejecting message send to maintain strict consistency.');
                throw new Error('Message send failed: Authentication session is not ready.');
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

        // ── Phase 1: Observability (Generate Correlation ID) ──
        const cid = generateCorrelationId();
        trackCorrelation(cid, 'sendMessage');
        logger.info('CHAT', 'Initiating send message', { correlationId: cid, conversationId, type });

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
            const merged = stableMerge(current, [optimisticMessage]);
            return { ...prev, [conversationId]: merged as Message[] };
        });

        // 1. Push Intent to Offline Queue
        await offlineQueue.pushIntent({
            event_id: clientEventId,
            conversation_id: conversationId,
            payload: { content, type, attachmentId, replyTo, correlationId: cid },
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
            const merged = stableMerge(current, [optimisticMessage]);
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
                    const merged = stableMerge(current, [canonicalMessage]);
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
