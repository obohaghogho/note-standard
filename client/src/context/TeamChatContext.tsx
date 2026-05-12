import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseSafe';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';
import {
  getTeamMessages,
  sendMessage as apiSendMessage,
  getTeamMembers,
  getTeamStats,
  deleteTeamMessage,
  editTeamMessage,
  clearTeamChatHistory,
} from '../lib/teamsApi';
import type {
  TeamMessage,
  TeamMember,
  SendMessageRequest,
  RealtimePayload,
  TeamStats,
} from '../types/teams';

interface TeamChatContextValue {
  messages: TeamMessage[];
  members: TeamMember[];
  loading: boolean;
  connected: boolean;
  sendMessage: (content: string, metadata?: Record<string, unknown>, type?: import('../types/teams').MessageType, replyToId?: string) => Promise<void>;
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

const TeamChatContext = createContext<TeamChatContextValue | null>(null);

export const useTeamChat = () => {
    const context = useContext(TeamChatContext);
    if (!context) throw new Error('useTeamChat must be used within a TeamChatProvider');
    return context;
};

interface TeamChatProviderProps {
  teamId: string;
  children: React.ReactNode;
}

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

  const isMounted = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const lastLoadedTeamId = useRef<string | null>(null);

  const loadInitialData = useCallback(async () => {
    if (!teamId || !user || !authReady || loadingRef.current) return;
    
    if (user.id && lastUserIdRef.current && lastUserIdRef.current !== user.id) {
        setMessages([]);
        setMembers([]);
        setTeamStats(null);
        setLoading(true);
    }
    lastUserIdRef.current = user.id;

    loadingRef.current = true;
    if (lastLoadedTeamId.current !== teamId) setLoading(true);
    lastLoadedTeamId.current = teamId;

    try {
      const [messagesData, membersData, statsData] = await Promise.all([
        getTeamMessages(teamId, 50),
        getTeamMembers(teamId),
        getTeamStats(teamId)
      ]);

      if (isMounted.current) {
        setMessages(messagesData.map(m => ({ ...m, isOwn: m.sender_id === user.id })));
        setMembers(membersData);
        setTeamStats(statsData);
        setHasMore(messagesData.length >= 50);
        setError(null);
      }
    } catch (err) {
      console.error('[TeamChat] Failed to load data:', err);
      if (isMounted.current) setError('Failed to load chat');
    } finally {
      loadingRef.current = false;
      if (isMounted.current) setLoading(false);
    }
  }, [teamId, user, authReady]);

  useEffect(() => {
    isMounted.current = true;
    loadInitialData();
    return () => { isMounted.current = false; };
  }, [loadInitialData]);

  const setupRealtime = useCallback(() => {
    if (!teamId || !user || !authReady) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase.channel(`team:${teamId}`);
    
    channel.on('postgres_changes' as never, { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `team_id=eq.${teamId}` }, (payload: { new: TeamMessage }) => {
        if (!isMounted.current) return;
        setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            // Fetch the enriched message with reply context if needed
            // For now just add it, but ideally we'd re-fetch or use a more complex payload
            return [...prev, { ...payload.new, isOwn: payload.new.sender_id === user.id }];
        });
    });

    channel.on('postgres_changes' as never, { event: 'UPDATE', schema: 'public', table: 'team_messages', filter: `team_id=eq.${teamId}` }, (payload: { new: TeamMessage }) => {
        if (!isMounted.current) return;
        const updated = payload.new;
        if (updated.is_deleted) {
            setMessages(prev => prev.filter(m => m.id !== updated.id));
        } else {
            setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
    });

    channel.on('postgres_changes' as never, { event: 'DELETE', schema: 'public', table: 'team_messages', filter: `team_id=eq.${teamId}` }, (payload: { old: { id: string } }) => {
        if (!isMounted.current) return;
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
    });

    channel.subscribe((status) => {
        if (isMounted.current) setConnected(status === 'SUBSCRIBED');
    });

    channelRef.current = channel;
  }, [teamId, user, authReady]);

  useEffect(() => {
    setupRealtime();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [setupRealtime]);

  const sendMessage = async (content: string, metadata?: Record<string, unknown>, type: import('../types/teams').MessageType = 'text', replyToId?: string) => {
    if (!user || (!content.trim() && !metadata)) return;
    try {
        await apiSendMessage(teamId, { content, message_type: type, metadata, replyToId } as SendMessageRequest);
        // Sync latest or let socket handle
    } catch (err) {
        toast.error('Failed to send message');
    }
  };

  const deleteMessage = async (messageId: string) => {
      try {
          await deleteTeamMessage(teamId, messageId);
          toast.success('Message deleted');
      } catch (err) {
          toast.error('Failed to delete message');
      }
  };

  const editMessage = async (messageId: string, content: string) => {
      try {
          await editTeamMessage(teamId, messageId, content);
          toast.success('Message updated');
      } catch (err) {
          toast.error('Failed to edit message');
      }
  };

  const value: TeamChatContextValue = {
    messages, members, loading, connected,
    sendMessage,
    shareNote: async () => {},
    loadMoreMessages: async () => {},
    hasMore,
    deleteMessage,
    editMessage,
    clearChatHistory: async () => {},
    sendTypingStatus: () => {},
    typingUsers, teamStats, error
  };

  return <TeamChatContext.Provider value={value}>{children}</TeamChatContext.Provider>;
};
