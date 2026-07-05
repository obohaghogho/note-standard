import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { idbGet, idbSet, STORES } from '../lib/indexedDB';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '';

export interface DashboardWidget {
  widget: string;
  position: number;
  visible: boolean;
  width: 'full' | 'half' | 'third';
}

export interface DashboardStats {
  total: number;
  favorites: number;
  pinned: number;
  archived: number;
  checklists: number;
  voice: number;
  image: number;
  shared: number;
  attachments_count: number;
  attachments_size: number;
}

export interface RecentNote {
  id: string;
  title: string;
  content: string;
  note_type: string;
  last_opened_at: string;
  cover_image?: string;
  color?: string;
  word_count: number;
  reading_time: number;
  is_pinned: boolean;
  is_archived: boolean;
}

export interface NoteCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  note_count: number;
  last_updated: string | null;
}

export interface ActivityItem {
  id: string;
  action_type: string;
  created_at: string;
  details: Record<string, unknown>;
  note_title?: string;
  note_type?: string;
}

export interface ChartPoint {
  date: string;
  created: number;
  edited: number;
  completed: number;
}

export interface SuggestionItem {
  id: string;
  type: string;
  title: string;
  message: string;
  targetId: string;
}

interface NotesDashboardContextType {
  widgets: DashboardWidget[];
  stats: DashboardStats | null;
  recentNotes: RecentNote[];
  categories: NoteCategory[];
  activity: { timeline: ActivityItem[]; chart: ChartPoint[] };
  suggestions: SuggestionItem[];
  streak: number;
  loading: boolean;
  updateWidgetLayout: (newLayout: DashboardWidget[]) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  logActivity: (noteId: string, actionType: string, details?: Record<string, unknown>) => Promise<void>;
}

const NotesDashboardContext = createContext<NotesDashboardContextType | undefined>(undefined);

export const NotesDashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [categories, setCategories] = useState<NoteCategory[]>([]);
  const [activity, setActivity] = useState<{ timeline: ActivityItem[]; chart: ChartPoint[] }>({ timeline: [], chart: [] });
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Load from IndexedDB local cache first (instant loading)
  const loadFromCache = useCallback(async () => {
    if (!user) return;
    try {
      const cachedWidgets = await idbGet<any>(STORES.USER_PREFS, `widgets_${user.id}`);
      if (cachedWidgets && Array.isArray(cachedWidgets.widget)) {
        setWidgets(cachedWidgets.widget);
      }

      const cachedStats = await idbGet<any>(STORES.DASHBOARD_STATS, user.id);
      if (cachedStats) {
        const { userId, ...pureStats } = cachedStats;
        setStats(pureStats);
      }

      const cachedRecent = await idbGet<any>(STORES.DASHBOARD_RECENT, user.id);
      if (cachedRecent && Array.isArray(cachedRecent.notes)) {
        setRecentNotes(cachedRecent.notes);
      }

      const cachedCats = await idbGet<any>(STORES.DASHBOARD_CATEGORIES, user.id);
      if (cachedCats && Array.isArray(cachedCats.categories)) {
        setCategories(cachedCats.categories);
      }

      const cachedActivity = await idbGet<any>(STORES.DASHBOARD_ACTIVITY, user.id);
      if (cachedActivity) {
        setActivity({ 
          timeline: cachedActivity.timeline || [], 
          chart: cachedActivity.chart || [] 
        });
      }

      const cachedSuggestions = await idbGet<any>(STORES.DASHBOARD_SUGGESTIONS, user.id);
      if (cachedSuggestions) {
        setSuggestions(cachedSuggestions.suggestions || []);
        setStreak(cachedSuggestions.streak || 0);
      }
    } catch (err) {
      console.warn("[DashboardCache] Failed to load cache:", err);
    }
  }, [user]);

  // Fetch fresh data from backend
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    
    // Set headers with token
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [
        layoutRes,
        statsRes,
        recentRes,
        categoriesRes,
        activityRes,
        suggestionsRes
      ] = await Promise.all([
        axios.get(`${API_URL}/api/dashboard/notes/layout`, { headers }),
        axios.get(`${API_URL}/api/dashboard/notes/stats`, { headers }),
        axios.get(`${API_URL}/api/dashboard/notes/recent`, { headers }),
        axios.get(`${API_URL}/api/dashboard/notes/categories`, { headers }),
        axios.get(`${API_URL}/api/dashboard/notes/activity`, { headers }),
        axios.get(`${API_URL}/api/dashboard/notes/suggestions`, { headers })
      ]);

      setWidgets(layoutRes.data);
      setStats(statsRes.data);
      setRecentNotes(recentRes.data);
      setCategories(categoriesRes.data);
      setActivity({ timeline: activityRes.data.timeline, chart: activityRes.data.chart });
      setSuggestions(suggestionsRes.data.suggestions);
      setStreak(suggestionsRes.data.streak);

      // Save to cache
      await Promise.all([
        idbSet(STORES.USER_PREFS, { key: `widgets_${user.id}`, widget: layoutRes.data }),
        idbSet(STORES.DASHBOARD_STATS, { userId: user.id, ...statsRes.data }),
        idbSet(STORES.DASHBOARD_RECENT, { userId: user.id, notes: recentRes.data }),
        idbSet(STORES.DASHBOARD_CATEGORIES, { userId: user.id, categories: categoriesRes.data }),
        idbSet(STORES.DASHBOARD_ACTIVITY, { userId: user.id, timeline: activityRes.data.timeline, chart: activityRes.data.chart }),
        idbSet(STORES.DASHBOARD_SUGGESTIONS, { userId: user.id, suggestions: suggestionsRes.data.suggestions, streak: suggestionsRes.data.streak })
      ]);
    } catch (err) {
      console.error("[DashboardController] Failed to fetch fresh dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Update layout positions
  const updateWidgetLayout = async (newLayout: DashboardWidget[]) => {
    if (!user) return;
    
    // Optimistic UI update
    setWidgets(newLayout);
    await idbSet(STORES.USER_PREFS, { key: `widgets_${user.id}`, widget: newLayout });

    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_URL}/api/dashboard/notes/layout`,
        newLayout,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("[DashboardController] Failed to update layout on server:", err);
      toast.error("Failed to save layout configuration.");
    }
  };

  // Log new note activity from UI client
  const logActivity = async (noteId: string, actionType: string, details = {}) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/api/notes/${noteId}/activity`,
        { actionType, details },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Silently refresh activity component
      fetchDashboardData();
    } catch (err) {
      console.warn("[DashboardController] Failed to log activity:", err);
    }
  };

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    await loadFromCache();
    await fetchDashboardData();
  }, [loadFromCache, fetchDashboardData]);

  // Initialize and subscribe
  useEffect(() => {
    if (user) {
      refreshDashboard();
    } else {
      setWidgets([]);
      setStats(null);
      setRecentNotes([]);
      setCategories([]);
      setActivity({ timeline: [], chart: [] });
      setSuggestions([]);
      setLoading(false);
    }
  }, [user, refreshDashboard]);

  // Socket updates for live stats/ timeline additions
  useEffect(() => {
    if (!socket || !connected) return;

    const handleStatsUpdate = () => {
      fetchDashboardData();
    };

    socket.on("note:dashboard_stats_updated", handleStatsUpdate);
    socket.on("note:activity_logged", handleStatsUpdate);

    return () => {
      socket.off("note:dashboard_stats_updated", handleStatsUpdate);
      socket.off("note:activity_logged", handleStatsUpdate);
    };
  }, [socket, connected, fetchDashboardData]);

  return (
    <NotesDashboardContext.Provider
      value={{
        widgets,
        stats,
        recentNotes,
        categories,
        activity,
        suggestions,
        streak,
        loading,
        updateWidgetLayout,
        refreshDashboard,
        logActivity,
      }}
    >
      {children}
    </NotesDashboardContext.Provider>
  );
};

export const useNotesDashboard = () => {
  const context = useContext(NotesDashboardContext);
  if (context === undefined) {
    throw new Error("useNotesDashboard must be used within a NotesDashboardProvider");
  }
  return context;
};
