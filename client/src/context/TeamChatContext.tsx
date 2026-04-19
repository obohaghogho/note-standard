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
  getTeamStats,
  deleteTeamMessage,
  editTeamMessage,
  clearTeamChatHistory,
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
  sendMessage: (content: string, metadata?: Record<string, unknown>, type?: import('../types/teams').MessageType) => Promise<void>;
  shareNote: (noteId: string, permission?: 'read' | 'edit') => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMore: boolean;
  deleteMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  clearChatHistory: () => Promise<void>;
  sendTypingStatus: (isTyping: boolean) => void;
  typingUsers: string[];
  teamStats: TeamStats | null;
  error: string | null;
}

const TeamChatContext = createContext<TeamChatContextValue>({
  messages: [],
  members: [],
  loading: true,
  connected: false,
  sendMessage: async () => { /* Default placeholder */ },
  shareNote: async () => { /* Default placeholder */ },
  loadMoreMessages: async () => { /* Default placeholder */ },
  hasMore: false,
  deleteMessage: async () => { /* Default placeholder */ },
  editMessage: async () => { /* Default placeholder */ },
  clearChatHistory: async () => { /* Default placeholder */ },
  sendTypingStatus: () => { /* Default placeholder */ },
  typingUsers: [],
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
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for lifecycle and safety
  const isMounted = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadingRef = useRef(false);
  const sendCooldownRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  // Ref to break the circular dependency between setupRealtime ↔ handleReconnect.
  // handleReconnect calls setupRealtimeRef.current() instead of setupRealtime() directly,
  // allowing handleReconnect to be declared BEFORE setupRealtime without a TDZ error.
  const setupRealtimeRef = useRef<() => void>(() => {});

  // ====================================
  // LOAD INITIAL DATA
  // ====================================

  const lastLoadedTeamId = useRef<string | null>(null);
  const messagesCountRef = useRef(0);

  const loadInitialData = useCallback(async () => {
    if (loadingRef.current || !teamId || !user || !profile || !authReady) return;
    
    // If we already loaded this team and have data, only reload if forced or empty
    if (lastLoadedTeamId.current === teamId && messagesCountRef.current > 0) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);
    lastLoadedTeamId.current = teamId;

    try {
      // Load in parallel for speed
      const [messagesData, membersData, statsData] = await Promise.all([
        getTeamMessages(teamId, 50),
        getTeamMembers(teamId),
        getTeamStats(teamId)
      ]);

      if (!isMounted.current) return;

      messagesCountRef.current = messagesData.length;
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
    } catch (err: unknown) {
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
   
  }, [teamId, user, profile, authReady]);

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
  // DELETE MESSAGE
  // ====================================

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!teamId) return;
    try {
      const success = await deleteTeamMessage(teamId, messageId);
      if (success) {
        if (isMounted.current) {
          setMessages(prev => prev.filter(m => m.id !== messageId));
        }
      } else {
        toast.error('You do not have permission to delete this message');
      }
    } catch (err) {
      console.error('[TeamChat] Failed to delete message:', err);
      toast.error('Failed to delete message');
    }
  }, [teamId]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!teamId) return;
    
    // Optimistic update
    let oldContent = '';
    setMessages(prev => {
      const msg = prev.find(m => m.id === messageId);
      if (msg) oldContent = msg.content || '';
      return prev.map(m => m.id === messageId ? { ...m, content: newContent, is_edited: true, updated_at: new Date().toISOString() } : m);
    });

    try {
      const success = await editTeamMessage(teamId, messageId, newContent);
      if (!success) {
        throw new Error('Failed to edit team message');
      }
    } catch (err) {
      console.error('[TeamChat] Editing message failed:', err);
      // Rollback
      if (oldContent) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: oldContent, is_edited: false } : m));
      }
      toast.error('Failed to edit message');
    }
  }, [teamId]);

  const clearChatHistory = useCallback(async () => {
    if (!teamId) return;
    try {
      const success = await clearTeamChatHistory(teamId);
      if (success && isMounted.current) {
        setMessages([]);
        toast.success('Chat history cleared');
      }
    } catch (err) {
      console.error('[TeamChat] Failed to clear chat history:', err);
      toast.error('Failed to clear chat history');
    }
  }, [teamId]);

  // ====================================
  // SEND MESSAGE (WITH OPTIMISTIC UI)
  // ====================================

  const sendMessage = useCallback(
    async (content: string, metadata?: Record<string, unknown>, type: import('../types/teams').MessageType = 'text') => {
      if (!user || (!content.trim() && !metadata?.image_url && !metadata?.audio_url)) return;

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
        message_type: type,
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
          message_type: type,
          metadata,
        };

        const result = await apiSendMessage(teamId, req);

        if (!result) throw new Error('Failed to send message');

        // Replace optimistic with real (realtime will handle this, but fallback)
        if (!isMounted.current) return;
        
        setMessages((prev) =>
          prev.map((msg) => (msg.id === optimisticId ? { ...result, isOwn: true } : msg))
        );
      } catch (err: unknown) {
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
      } catch (err: unknown) {
        console.error('[TeamChat] Failed to share note:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to share note');
      }
    },
    [teamId]
  );
  
  // ====================================
  // TYPING INDICATORS (BROADCAST)
  // ====================================
  
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!channelRef.current || !user || !profile) return;
    
    channelRef.current.send({
      type: 'broadcast',
      event: 'user_typing',
      payload: { 
        userId: user.id, 
        userName: profile.full_name || profile.username || 'Someone',
        isTyping 
      }
    });
  }, [user, profile]);

  // Handler for typing events
  const handleTypingEvent = useCallback((payload: { userId: string; userName: string; isTyping: boolean }) => {
    const { userId, userName, isTyping } = payload;
    if (userId === user?.id) return;

    if (isTyping) {
      setTypingUsers(prev => prev.includes(userName) ? prev : [...prev, userName]);
      
      // Auto-clear after 5 seconds if no 'stop' received
      if (typingTimersRef.current[userId]) {
        clearTimeout(typingTimersRef.current[userId]);
      }
      typingTimersRef.current[userId] = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u !== userName));
      }, 5000);
    } else {
      if (typingTimersRef.current[userId]) {
        clearTimeout(typingTimersRef.current[userId]);
      }
      setTypingUsers(prev => prev.filter(u => u !== userName));
    }
  }, [user?.id]);

  // ====================================
  // RECONNECTION WITH EXPONENTIAL BACKOFF
  // (Defined BEFORE setupRealtime to prevent TDZ in production bundles)
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

    // Call setupRealtime via ref to avoid circular dependency with useCallback
    retryTimeoutRef.current = setTimeout(() => {
      if (isMounted.current) {
        setupRealtimeRef.current();
      }
    }, delay);
  }, []); // No deps on setupRealtime — uses the ref instead to break the cycle

  // ====================================
  // REALTIME SUBSCRIPTION (WITH SAFETY)
  // handleReconnect is declared above, so referencing it here is safe (no TDZ)
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
        'postgres_changes' as never,
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

          setMessages(prev => {
            const exists = prev.find(m => m.id === payload.new.id);
            if (exists) return prev;
            return [...prev, { ...payload.new, isOwn: payload.new.sender_id === user.id }];
          });

          // Mark as read
          if (newMessage.sender_id !== user.id) {
            await markMessagesRead(teamId);
          }
        }
      );

      // Listen for message updates (edits / soft-deletes)
      channel.on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_messages',
          filter: `team_id=eq.${teamId}`,
        },
        async (payload: RealtimePayload<TeamMessage>) => {
          if (!isMounted.current) return;
          const updatedMsg = payload.new;
          if (updatedMsg.is_deleted) {
            setMessages(prev => prev.filter(m => m.id !== updatedMsg.id));
          } else if (updatedMsg.is_edited) {
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, content: updatedMsg.content, is_edited: true, updated_at: updatedMsg.updated_at } : m));
          } else if (updatedMsg.content) {
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, content: updatedMsg.content, updated_at: updatedMsg.updated_at, is_edited: updatedMsg.is_edited } : m));
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
      channel.subscribe((status) => {
        console.log('[TeamChat] Subscription status:', status);

        if (status === 'SUBSCRIBED') {
          setConnected(true);
          retryCountRef.current = 0;
          toast.success('Connected to team chat', { duration: 2000, icon: '🟢' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
          handleReconnect(); // Safe — handleReconnect is declared above
        } else if (status === 'CLOSED') {
          setConnected(false);
        }
      });

      // Listen for typing broadcast
      channel.on('broadcast', { event: 'user_typing' }, ({ payload }) => {
        handleTypingEvent(payload);
      });

      channelRef.current = channel;
    } catch (err) {
      console.error('[TeamChat] Failed to setup realtime:', err);
      setConnected(false);
      handleReconnect(); // Safe — handleReconnect is declared above
    }
  }, [teamId, user, profile, authReady, handleReconnect, handleTypingEvent]);

  // Keep setupRealtimeRef in sync so handleReconnect can always call the latest version
  useEffect(() => {
    setupRealtimeRef.current = setupRealtime;
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

  // Setup realtime as soon as we have a teamId and auth
  useEffect(() => {
    if (teamId && user && profile && authReady) {
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
  }, [loading, teamId, user, profile, authReady, setupRealtime]);

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
    deleteMessage,
    editMessage,
    clearChatHistory,
    sendTypingStatus,
    typingUsers,
    teamStats,
    error,
  };

  return <TeamChatContext.Provider value={value}>{children}</TeamChatContext.Provider>;
};
