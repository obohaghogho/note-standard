// ====================================
// TEAM CHAT CONTEXT
// Real-time team collaboration with safety
// ====================================

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseSafe';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';
import {
  getTeamMessages,
  sendMessage as apiSendMessage,
  markMessagesRead,
  getTeamMembers,
  shareNote as apiShareNote,
} from '../lib/teamsApi';
import type {
  TeamMessage,
  TeamMember,
  SendMessageRequest,
  ShareNoteRequest,
  RealtimePayload,
  TeamStats,
} from '../types/teams';

// ====================================
// CONTEXT TYPES
// ====================================

interface TeamChatContextValue {
  messages: TeamMessage[];
  members: TeamMember[];
  loading: boolean;
  connected: boolean;
  sendMessage: (content: string, metadata?: Record<string, any>) => Promise<void>;
  shareNote: (noteId: string, permission?: 'read' | 'edit') => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMore: boolean;
  teamStats: TeamStats | null;
  error: string | null;
}

const TeamChatContext = createContext<TeamChatContextValue>({
  messages: [],
  members: [],
  loading: true,
  connected: false,
  sendMessage: async () => {},
  shareNote: async () => {},
  loadMoreMessages: async () => {},
  hasMore: false,
  teamStats: null,
  error: null,
});

export const useTeamChat = () => useContext(TeamChatContext);

// ====================================
// PROVIDER PROPS
// ====================================

interface TeamChatProviderProps {
  teamId: string;
  children: React.ReactNode;
}

// ====================================
// EXPONENTIAL BACKOFF CONFIG
// ====================================

const BACKOFF_CONFIG = {
  initialDelay: 1000,
  maxDelay: 30000,
  maxRetries: 5,
};

// ====================================
// PROVIDER COMPONENT
// ====================================

export const TeamChatProvider: React.FC<TeamChatProviderProps> = ({ teamId, children }) => {
  const { user, profile, authReady } = useAuth();
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for lifecycle and safety
  const isMounted = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadingRef = useRef(false);
  const sendCooldownRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<any>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // ====================================
  // LOAD INITIAL DATA
  // ====================================

  const lastLoadedTeamId = useRef<string | null>(null);

  const loadInitialData = useCallback(async () => {
    if (loadingRef.current || !teamId || !user || !profile || !authReady) return;
    
    // If we already loaded this team and have data, only reload if forced or empty
    if (lastLoadedTeamId.current === teamId && messages.length > 0) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);
    lastLoadedTeamId.current = teamId;

    try {
      // Load in parallel for speed
      const [messagesData, membersData, statsData] = await Promise.all([
        getTeamMessages(teamId, 50),
        getTeamMembers(teamId),
        import('../lib/teamsApi').then(m => m.getTeamStats(teamId))
      ]);

      if (!isMounted.current) return;

      setMessages(messagesData);
      setMembers(membersData);
      setTeamStats(statsData);

      // Mark as read
      await markMessagesRead(teamId);

      if (messagesData.length < 50) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      lastMessageIdRef.current =
        messagesData.length > 0 ? messagesData[messagesData.length - 1].id : null;
    } catch (err: any) {
      console.error('[TeamChat] Failed to load initial data:', err);
      if (isMounted.current) {
        setError('Failed to load chat. Please refresh.');
        toast.error('Failed to load chat');
      }
    } finally {
      loadingRef.current = false;
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [teamId, user, profile, authReady, messages.length]);

  // ====================================
  // LOAD MORE MESSAGES (PAGINATION)
  // ====================================

  const loadMoreMessages = useCallback(async () => {
    if (loadingRef.current || !hasMore || messages.length === 0) return;

    loadingRef.current = true;

    try {
      const oldestMessage = messages[0];
      const olderMessages = await getTeamMessages(teamId, 50, oldestMessage.created_at);

      if (!isMounted.current) return;

      setMessages((prev) => [...olderMessages, ...prev]);

      if (olderMessages.length < 50) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[TeamChat] Failed to load more messages:', err);
      toast.error('Failed to load older messages');
    } finally {
      loadingRef.current = false;
    }
  }, [teamId, messages, hasMore]);

  // ====================================
  // SEND MESSAGE (WITH OPTIMISTIC UI)
  // ====================================

  const sendMessage = useCallback(
    async (content: string, metadata?: Record<string, any>) => {
      if (!user || !content.trim()) return;

      // Cooldown check (prevent spam)
      if (sendCooldownRef.current) {
        toast.error('Please wait before sending another message');
        return;
      }

      sendCooldownRef.current = true;
      setTimeout(() => {
        sendCooldownRef.current = false;
      }, 1000); // 1s cooldown

      // Optimistic message
      const optimisticId = `temp-${Date.now()}`;
      const optimisticMessage: TeamMessage = {
        id: optimisticId,
        team_id: teamId,
        sender_id: user.id,
        content,
        message_type: 'text',
        metadata: metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
        isOwn: true,
        isOptimistic: true,
        sender: {
          id: user.id,
          email: user.email ?? '',
          username: user.user_metadata?.username,
          full_name: user.user_metadata?.full_name,
          avatar_url: user.user_metadata?.avatar_url,
        },
      };

      // Add optimistically
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const req: SendMessageRequest = {
          content,
          metadata,
        };

        const result = await apiSendMessage(teamId, req);

        if (!result) throw new Error('Failed to send message');

        // Replace optimistic with real (realtime will handle this, but fallback)
        if (!isMounted.current) return;
        
        setMessages((prev) =>
          prev.map((msg) => (msg.id === optimisticId ? { ...result, isOwn: true } : msg))
        );
      } catch (err: any) {
        console.error('[TeamChat] Failed to send message:', err);

        // Mark optimistic message as failed
        if (isMounted.current) {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === optimisticId ? { ...msg, failed: true } : msg))
          );
          toast.error('Failed to send message');
        }
      }
    },
    [teamId, user]
  );

  // ====================================
  // SHARE NOTE
  // ====================================

  const shareNote = useCallback(
    async (noteId: string, permission: 'read' | 'edit' = 'read') => {
      try {
        const req: ShareNoteRequest = {
          note_id: noteId,
          permission,
        };

        const result = await apiShareNote(teamId, req);

        if (!result) throw new Error('Failed to share note');

        toast.success('Note shared successfully');
      } catch (err: any) {
        console.error('[TeamChat] Failed to share note:', err);
        toast.error(err.message || 'Failed to share note');
      }
    },
    [teamId]
  );

  // ====================================
  // REALTIME SUBSCRIPTION (WITH SAFETY)
  // ====================================

  const setupRealtime = useCallback(() => {
    if (!teamId || !user || !profile || !authReady) return;

    // Clean up existing channel
    if (channelRef.current) {
      console.log('[TeamChat] Cleaning up existing channel');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    console.log('[TeamChat] Setting up realtime for team:', teamId);

    try {
      const channel = supabase.channel(`team:${teamId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: user.id },
        },
      });

      // Listen for new messages
      channel.on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: `team_id=eq.${teamId}`,
        },
        async (payload: RealtimePayload<TeamMessage>) => {
          if (!isMounted.current) return;

          console.log('[TeamChat] New message received:', payload.new);

          const newMessage = payload.new;

          // Prevent duplicates
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMessage.id);
            if (exists) return prev;

            // Remove optimistic if exists
            const filtered = prev.filter((m) => !m.isOptimistic);

            return [...filtered, { ...newMessage, isOwn: newMessage.sender_id === user.id }];
          });

          // Mark as read
          if (newMessage.sender_id !== user.id) {
            await markMessagesRead(teamId);
          }
        }
      );

      // Listen for member changes
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
          filter: `team_id=eq.${teamId}`,
        },
        async () => {
          if (!isMounted.current) return;
          console.log('[TeamChat] Member change detected, reloading members');
          const updatedMembers = await getTeamMembers(teamId);
          if (isMounted.current) {
            setMembers(updatedMembers);
          }
        }
      );

      // Subscribe with error handling
      channel
        .subscribe((status) => {
          console.log('[TeamChat] Subscription status:', status);

          if (status === 'SUBSCRIBED') {
            setConnected(true);
            retryCountRef.current = 0;
            toast.success('Connected to team chat', { duration: 2000, icon: '🟢' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnected(false);
            handleReconnect();
          } else if (status === 'CLOSED') {
            setConnected(false);
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.error('[TeamChat] Failed to setup realtime:', err);
      setConnected(false);
      handleReconnect();
    }
  }, [teamId, user, profile, authReady]);

  // ====================================
  // RECONNECTION WITH EXPONENTIAL BACKOFF
  // ====================================

  const handleReconnect = useCallback(() => {
    if (retryCountRef.current >= BACKOFF_CONFIG.maxRetries) {
      console.warn('[TeamChat] Max retries reached, switching to polling');
      toast.error('Real-time connection lost. Refresh to reconnect.', { duration: 5000 });
      setConnected(false);
      return;
    }

    retryCountRef.current += 1;
    const delay = Math.min(
      BACKOFF_CONFIG.initialDelay * Math.pow(2, retryCountRef.current - 1),
      BACKOFF_CONFIG.maxDelay
    );

    console.log(
      `[TeamChat] Reconnecting in ${delay}ms (attempt ${retryCountRef.current}/${BACKOFF_CONFIG.maxRetries})`
    );

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      if (isMounted.current) {
        setupRealtime();
      }
    }, delay);
  }, [setupRealtime]);

  // ====================================
  // EFFECTS
  // ====================================

  // Load initial data on mount
  useEffect(() => {
    isMounted.current = true;
    loadInitialData();

    return () => {
      isMounted.current = false;
    };
  }, [loadInitialData]);

  // Setup realtime after initial load
  useEffect(() => {
    if (!loading && teamId && user && profile && authReady) {
      setupRealtime();
    }

    return () => {
      if (channelRef.current) {
        console.log('[TeamChat] Cleaning up channel on unmount');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [loading, teamId, user, setupRealtime]);

  // ====================================
  // CONTEXT VALUE
  // ====================================

  const value: TeamChatContextValue = {
    messages,
    members,
    loading,
    connected,
    sendMessage,
    shareNote,
    loadMoreMessages,
    hasMore,
    teamStats,
    error,
  };

  return <TeamChatContext.Provider value={value}>{children}</TeamChatContext.Provider>;
};
