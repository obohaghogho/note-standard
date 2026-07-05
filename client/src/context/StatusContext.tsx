/**
 * StatusContext — NoteStandard
 * Provides status feed, viewer/creator state, and all status actions.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import api from '../api/axiosInstance';
import toast from 'react-hot-toast';
import { useSocket } from './SocketContext';

// ── Types ──────────────────────────────────────────────────────────────────
export interface StatusItem {
  id: string;
  user_id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'gif' | 'link' | 'document';
  content?: string;
  media_url?: string;
  media_thumbnail?: string;
  media_size?: number;
  media_duration?: number;
  bg_color?: string;
  bg_gradient?: string;
  font_style?: string;
  font_size?: number;
  text_align?: string;
  link_url?: string;
  link_title?: string;
  link_description?: string;
  link_image?: string;
  privacy: string;
  view_count: number;
  expires_at: string;
  created_at: string;
  has_viewed?: boolean;
  viewers?: Viewer[];
  reactions?: Reaction[];
}

export interface Viewer {
  id: string;
  display_name: string;
  avatar_url?: string;
  viewed_at: string;
  completed: boolean;
}

export interface Reaction {
  id: string;
  display_name: string;
  avatar_url?: string;
  emoji: string;
}

export interface StatusFeedEntry {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  statuses: StatusItem[];
  is_muted: boolean;
  has_unviewed: boolean;
}

interface ViewerState {
  userIndex: number;
  statusIndex: number;
}

interface StatusContextValue {
  feed: StatusFeedEntry[];
  myStatuses: StatusItem[];
  viewerOpen: ViewerState | null;
  creatorOpen: boolean;
  loading: boolean;
  fetchFeed: () => Promise<void>;
  fetchMyStatuses: () => Promise<void>;
  openViewer: (userIndex: number, statusIndex?: number) => void;
  closeViewer: () => void;
  nextStatus: () => void;
  prevStatus: () => void;
  openCreator: () => void;
  closeCreator: () => void;
  markViewed: (statusId: string) => Promise<void>;
  react: (statusId: string, emoji: string) => Promise<void>;
  reply: (statusId: string, content: string) => Promise<string>;
  createStatus: (payload: Record<string, unknown>) => Promise<void>;
  deleteStatus: (statusId: string) => Promise<void>;
  muteUser: (userId: string) => Promise<void>;
  // Realtime receivers
  receiveNewStatus: (status: StatusItem & { username: string; display_name: string; avatar_url?: string }) => void;
  updateViewCount: (statusId: string, viewCount: number) => void;
  removeStatus: (statusId: string) => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

export const useStatus = () => {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error('useStatus must be used within StatusProvider');
  return ctx;
};

export const StatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [feed, setFeed] = useState<StatusFeedEntry[]>([]);
  const [myStatuses, setMyStatuses] = useState<StatusItem[]>([]);
  const [viewerOpen, setViewerOpen] = useState<ViewerState | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/status/feed');
      setFeed(data);
    } catch (err) {
      console.error('[Status] Feed fetch error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyStatuses = useCallback(async () => {
    try {
      const { data } = await api.get('/status/my');
      setMyStatuses(data);
    } catch (err) {
      console.error('[Status] My statuses fetch error', err);
    }
  }, []);

  const openViewer = useCallback((userIndex: number, statusIndex = 0) => {
    setViewerOpen({ userIndex, statusIndex });
  }, []);

  const closeViewer = useCallback(() => setViewerOpen(null), []);
  const openCreator = useCallback(() => setCreatorOpen(true), []);
  const closeCreator = useCallback(() => setCreatorOpen(false), []);

  const nextStatus = useCallback(() => {
    setViewerOpen(prev => {
      if (!prev) return null;
      const { userIndex, statusIndex } = prev;
      const userEntry = feed[userIndex];
      if (!userEntry) return null;
      const isOwn = userIndex === 0;
      if (statusIndex + 1 < userEntry.statuses.length) {
        return { userIndex, statusIndex: statusIndex + 1 };
      } else if (!isOwn && userIndex + 1 < feed.length) {
        return { userIndex: userIndex + 1, statusIndex: 0 };
      }
      return null;
    });
  }, [feed]);

  const prevStatus = useCallback(() => {
    setViewerOpen(prev => {
      if (!prev) return null;
      const { userIndex, statusIndex } = prev;
      if (statusIndex > 0) return { userIndex, statusIndex: statusIndex - 1 };
      if (userIndex > 0) {
        const prevUser = feed[userIndex - 1];
        return { userIndex: userIndex - 1, statusIndex: prevUser.statuses.length - 1 };
      }
      return prev;
    });
  }, [feed]);

  const markViewed = useCallback(async (statusId: string) => {
    try {
      await api.post(`/status/${statusId}/view`, { completed: true });
      setFeed(f => f.map(u => {
        const updatedStatuses = u.statuses.map(st =>
          st.id === statusId ? { ...st, has_viewed: true } : st
        );
        return { ...u, statuses: updatedStatuses, has_unviewed: updatedStatuses.some(st => !st.has_viewed) };
      }));
    } catch (err) {
      console.error('[Status] markViewed error', err);
    }
  }, []);

  const react = useCallback(async (statusId: string, emoji: string) => {
    await api.post(`/status/${statusId}/react`, { emoji });
  }, []);

  const reply = useCallback(async (statusId: string, content: string) => {
    const { data } = await api.post(`/status/${statusId}/reply`, { content });
    return data.conversation_id as string;
  }, []);

  const createStatus = useCallback(async (payload: Record<string, unknown>) => {
    await api.post('/status', payload);
    await fetchFeed();
    await fetchMyStatuses();
  }, [fetchFeed, fetchMyStatuses]);

  const deleteStatus = useCallback(async (statusId: string) => {
    await api.delete(`/status/${statusId}`);
    setFeed(f => f
      .map(u => ({ ...u, statuses: u.statuses.filter(st => st.id !== statusId) }))
      .filter(u => u.statuses.length > 0)
    );
    setMyStatuses(m => m.filter(st => st.id !== statusId));
  }, []);

  const muteUser = useCallback(async (userId: string) => {
    await api.post(`/status/mute/${userId}`);
    setFeed(f => f.map(u => u.user_id === userId ? { ...u, is_muted: true } : u));
  }, []);

  // ── Realtime receivers (called by SocketContext) ───────────────────────
  const receiveNewStatus = useCallback((status: StatusItem & { username: string; display_name: string; avatar_url?: string }) => {
    setFeed(f => {
      const idx = f.findIndex(u => u.user_id === status.user_id);
      if (idx >= 0) {
        const updated = [...f];
        updated[idx] = {
          ...updated[idx],
          statuses: [{ ...status, has_viewed: false }, ...updated[idx].statuses],
          has_unviewed: true,
        };
        return updated;
      }
      return [{
        user_id: status.user_id,
        username: status.username,
        display_name: status.display_name,
        avatar_url: status.avatar_url,
        statuses: [{ ...status, has_viewed: false }],
        has_unviewed: true,
        is_muted: false,
      }, ...f];
    });
  }, []);

  const updateViewCount = useCallback((statusId: string, viewCount: number) => {
    setMyStatuses(m => m.map(st => st.id === statusId ? { ...st, view_count: viewCount } : st));
  }, []);

  const removeStatus = useCallback((statusId: string) => {
    setFeed(f => f
      .map(u => ({ ...u, statuses: u.statuses.filter(st => st.id !== statusId) }))
      .filter(u => u.statuses.length > 0)
    );
  }, []);

  // ── Setup Socket Listeners ────────────────────────────────────────────────
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    
    socket.on('status:new', receiveNewStatus);
    socket.on('status:viewed', (data) => updateViewCount(data.status_id, data.view_count));
    socket.on('status:deleted', (data) => removeStatus(data.status_id));
    socket.on('status:reaction', (data) => {
      // Could show a toast or update local state for reactions
      toast.success(`${data.reactor?.display_name || 'Someone'} reacted ${data.emoji} to your status!`);
    });

    return () => {
      socket.off('status:new', receiveNewStatus);
      socket.off('status:viewed');
      socket.off('status:deleted');
      socket.off('status:reaction');
    };
  }, [socket, receiveNewStatus, updateViewCount, removeStatus]);

  return (
    <StatusContext.Provider value={{
      feed, myStatuses, viewerOpen, creatorOpen, loading,
      fetchFeed, fetchMyStatuses,
      openViewer, closeViewer, nextStatus, prevStatus,
      openCreator, closeCreator,
      markViewed, react, reply, createStatus, deleteStatus, muteUser,
      receiveNewStatus, updateViewCount, removeStatus,
    }}>
      {children}
    </StatusContext.Provider>
  );
};
