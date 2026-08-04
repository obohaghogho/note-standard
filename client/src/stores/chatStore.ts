import { create } from 'zustand';
import { generateSnowflakeId } from '../utils/snowflakeId';

export type MessageStatus = 'draft' | 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Attachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  metadata: Record<string, unknown>;
}

export interface ReplyTo {
  id: string;
  content: string;
  sender_id: string;
  type?: string;
  attachment?: Attachment;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  type: 'text' | 'image' | 'video' | 'file' | 'audio' | 'call';
  sender_type?: 'user' | 'ai' | 'human' | 'system';
  isOwn?: boolean;
  original_language?: string;
  read_at?: string;
  delivered_at?: string;
  is_edited?: boolean;
  updated_at?: string;
  status?: MessageStatus;
  sequence_number?: number;
  client_sequence?: number;
  server_sequence?: number;
  logical_sequence?: number;
  conversation_version?: number;
  event_id?: string;
  reply_to?: ReplyTo;
  attachment?: Attachment;
  correlation_id?: string;
}

export interface ConversationMember {
  user_id: string;
  role: string;
  status: string;
  profile?: {
    username: string;
    full_name: string;
    avatar_url: string;
    is_online?: boolean;
    plan_tier?: string;
    is_verified?: boolean;
    show_online_status?: boolean;
    last_seen?: string;
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
    status?: MessageStatus;
    event_id?: string;
  };
  unreadCount?: number;
  is_muted?: boolean;
  isBlocked?: boolean;
  blockedByMe?: boolean;
  blockedByThem?: boolean;
  members: ConversationMember[];
}

export interface ConversationSnapshot {
  conversationId: string;
  scrollOffset: number;
  draftText: string;
  replyTo: ReplyTo | null;
  unreadDividerId: string | null;
  lastReadSequence: number;
}

export interface PerformanceMetrics {
  fps: number;
  renderTimeMs: number;
  socketRttMs: number;
  memoryMb: number;
  queueLength: number;
  droppedFrames: number;
  reconnectCount: number;
  virtualizedNodeCount: number;
}

const STATUS_WEIGHT: Record<MessageStatus, number> = {
  draft: 0,
  pending: 1,
  sending: 2,
  failed: 2,
  sent: 3,
  delivered: 4,
  read: 5,
};

export interface ChatStoreState {
  // Normalized Data Structures
  messagesById: Record<string, Message>;
  conversationMessageIds: Record<string, string[]>;
  conversationsById: Record<string, Conversation>;
  conversationIds: string[];
  activeConversationId: string | null;
  typingUsers: Record<string, string[]>;
  drafts: Record<string, string>;
  hasMore: Record<string, boolean>;
  snapshots: Record<string, ConversationSnapshot>;
  metrics: PerformanceMetrics;

  // Actions
  setActiveConversationId: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  upsertConversation: (conversation: Conversation) => void;
  upsertMessages: (conversationId: string, messages: Message[], prepend?: boolean) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus, timestamps?: { delivered_at?: string; read_at?: string }) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setTypingStatus: (conversationId: string, username: string, isTyping: boolean) => void;
  setDraft: (conversationId: string, content: string) => void;
  saveSnapshot: (snapshot: ConversationSnapshot) => void;
  updateMetrics: (partialMetrics: Partial<PerformanceMetrics>) => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  messagesById: {},
  conversationMessageIds: {},
  conversationsById: {},
  conversationIds: [],
  activeConversationId: null,
  typingUsers: {},
  drafts: {},
  hasMore: {},
  snapshots: {},
  metrics: {
    fps: 60,
    renderTimeMs: 0,
    socketRttMs: 0,
    memoryMb: 0,
    queueLength: 0,
    droppedFrames: 0,
    reconnectCount: 0,
    virtualizedNodeCount: 0,
  },

  setActiveConversationId: (id) => {
    set({ activeConversationId: id });
  },

  setConversations: (conversations) => {
    const conversationsById: Record<string, Conversation> = {};
    const conversationIds: string[] = [];

    conversations.forEach((conv) => {
      conversationsById[conv.id] = conv;
      conversationIds.push(conv.id);
    });

    set({ conversationsById, conversationIds });
  },

  upsertConversation: (conversation) => {
    set((state) => {
      const exists = !!state.conversationsById[conversation.id];
      const conversationIds = exists
        ? state.conversationIds
        : [conversation.id, ...state.conversationIds];

      return {
        conversationsById: {
          ...state.conversationsById,
          [conversation.id]: conversation,
        },
        conversationIds,
      };
    });
  },

  upsertMessages: (conversationId, newMessages, prepend = false) => {
    if (!newMessages.length) return;

    set((state) => {
      const nextMessagesById = { ...state.messagesById };
      const currentIds = state.conversationMessageIds[conversationId] || [];
      const idSet = new Set(currentIds);

      const newIdsToInsert: string[] = [];

      newMessages.forEach((msg) => {
        const existing = nextMessagesById[msg.id];
        if (existing) {
          // Status machine check: prevent status regression
          const oldWeight = existing.status ? STATUS_WEIGHT[existing.status] : 0;
          const newWeight = msg.status ? STATUS_WEIGHT[msg.status] : 0;
          const finalStatus = newWeight >= oldWeight ? msg.status : existing.status;

          nextMessagesById[msg.id] = {
            ...existing,
            ...msg,
            status: finalStatus,
            delivered_at: msg.delivered_at || existing.delivered_at,
            read_at: msg.read_at || existing.read_at,
          };
        } else {
          nextMessagesById[msg.id] = msg;
          if (!idSet.has(msg.id)) {
            newIdsToInsert.push(msg.id);
          }
        }
      });

      if (!newIdsToInsert.length) {
        return { messagesById: nextMessagesById };
      }

      // Chronological sort helper using Snowflake / timestamp fallback
      const sortFn = (idA: string, idB: string) => {
        const mA = nextMessagesById[idA];
        const mB = nextMessagesById[idB];
        if (!mA || !mB) return 0;
        const timeA = new Date(mA.created_at).getTime();
        const timeB = new Date(mB.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (mA.sequence_number || 0) - (mB.sequence_number || 0);
      };

      let finalIds: string[];
      if (prepend) {
        finalIds = [...newIdsToInsert, ...currentIds].sort(sortFn);
      } else {
        finalIds = [...currentIds, ...newIdsToInsert].sort(sortFn);
      }

      return {
        messagesById: nextMessagesById,
        conversationMessageIds: {
          ...state.conversationMessageIds,
          [conversationId]: finalIds,
        },
      };
    });
  },

  updateMessageStatus: (messageId, status, timestamps) => {
    set((state) => {
      const msg = state.messagesById[messageId];
      if (!msg) return state;

      const currentWeight = msg.status ? STATUS_WEIGHT[msg.status] : 0;
      const targetWeight = STATUS_WEIGHT[status];

      if (targetWeight < currentWeight) {
        return state; // Refuse status regression
      }

      const updatedMessage: Message = {
        ...msg,
        status,
        delivered_at: timestamps?.delivered_at || msg.delivered_at,
        read_at: timestamps?.read_at || msg.read_at,
      };

      return {
        messagesById: {
          ...state.messagesById,
          [messageId]: updatedMessage,
        },
      };
    });
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const nextMessagesById = { ...state.messagesById };
      delete nextMessagesById[messageId];

      const currentIds = state.conversationMessageIds[conversationId] || [];
      const nextIds = currentIds.filter((id) => id !== messageId);

      return {
        messagesById: nextMessagesById,
        conversationMessageIds: {
          ...state.conversationMessageIds,
          [conversationId]: nextIds,
        },
      };
    });
  },

  setTypingStatus: (conversationId, username, isTyping) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      let updated: string[];

      if (isTyping) {
        if (current.includes(username)) return state;
        updated = [...current, username];
      } else {
        if (!current.includes(username)) return state;
        updated = current.filter((u) => u !== username);
      }

      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: updated,
        },
      };
    });
  },

  setDraft: (conversationId, content) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [conversationId]: content,
      },
    }));
  },

  saveSnapshot: (snapshot) => {
    set((state) => ({
      snapshots: {
        ...state.snapshots,
        [snapshot.conversationId]: snapshot,
      },
    }));
  },

  updateMetrics: (partial) => {
    set((state) => ({
      metrics: {
        ...state.metrics,
        ...partial,
      },
    }));
  },

  clearAll: () => {
    set({
      messagesById: {},
      conversationMessageIds: {},
      conversationsById: {},
      conversationIds: [],
      activeConversationId: null,
      typingUsers: {},
      drafts: {},
      snapshots: {},
    });
  },
}));

// ── Fine-Grained Selectors for Zero-Re-render UI ─────────────────────────────
export const selectMessage = (messageId: string) => (state: ChatStoreState) =>
  state.messagesById[messageId];

export const selectConversationMessageIds = (conversationId: string | null) => (state: ChatStoreState) =>
  conversationId ? state.conversationMessageIds[conversationId] || [] : [];

export const selectConversation = (conversationId: string | null) => (state: ChatStoreState) =>
  conversationId ? state.conversationsById[conversationId] : undefined;

export const selectTypingUsers = (conversationId: string | null) => (state: ChatStoreState) =>
  conversationId ? state.typingUsers[conversationId] || [] : [];
