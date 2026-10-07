import React, { useState, useEffect } from 'react';
import {
  Sparkles, Video, Eye, Users, Play, Heart, MessageCircle, Bookmark,
  BarChart2, Calendar, X, Loader2, Settings, ShieldCheck, CheckCircle2,
  AlertCircle, ArrowRight, Globe, Lock, Info, Plus, Edit3, Trash2
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import ReelUploadModal from '../community/ReelUploadModal';
import { editPost, deletePost } from '../../services/communityService';

const CREATOR_CATEGORIES = [
  'Education & Academics',
  'Technology & Software',
  'Creative & Arts',
  'Business & Finance',
  'Lifestyle & Productivity',
  'Entertainment & Media'
] as const;

const SOCIAL_PLATFORMS = [
  { key: 'github', label: 'GitHub' },
  { key: 'twitter', label: 'Twitter / X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' }
] as const;

interface CreatorProfile {
  is_creator: boolean;
  creator_mode_enabled: boolean;
  creator_category: string | null;
  creator_onboarded_at: string | null;
  social_links: Record<string, string>;
}

interface AudienceGrowth {
  current_followers: number;
  period: string;
  new_followers_period: number;
  daily_growth_trend: Array<{ date: string; new_followers: number }>;
}

interface DraftItem {
  id: string;
  content_type: string;
  space_id?: string;
  title: string;
  content_payload?: {
    content?: string;
    media_url?: string;
  };
  status: string;
  scheduled_publish_at?: string;
  updated_at: string;
}

interface OverviewMetrics {
  total_views: number;
  lifetime_views: number;
  unique_viewers: number;
  total_followers: number;
  followers_gained_period: number;
  total_likes: number;
  total_comments: number;
  total_saves: number;
  engagement_rate_pct: number;
  total_published_reels: number;
}

interface ReelsSummary {
  total_watch_time_seconds: number;
  avg_watch_duration_seconds: number;
  authenticated_viewers: number;
  anonymous_viewers: number;
}

interface TrendPoint {
  date: string;
  views: number;
  watch_time_seconds: number;
}

interface TopReel {
  id: string;
  content: string;
  media_url?: string;
  video_duration: number;
  views_count: number;
  avg_watch_duration_seconds: number;
  created_at: string;
}

interface SingleReelAnalytics {
  id: string;
  content: string;
  media_url?: string;
  video_duration: number;
  published_at: string;
  views_count: number;
  unique_viewers: number;
  authenticated_viewers: number;
  anonymous_viewers: number;
  total_watch_time_seconds: number;
  avg_watch_duration_seconds: number;
  likes_count: number;
  comments_count: number;
  bookmarks_count: number;
  engagement_rate_pct: number;
}

export const CreatorStudio: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'reels' | 'drafts' | 'settings'>('overview');
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modeStatus, setModeStatus] = useState<'not_creator' | 'mode_disabled' | 'active'>('active');
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [audienceGrowth, setAudienceGrowth] = useState<AudienceGrowth | null>(null);
  const [reelsSummary, setReelsSummary] = useState<ReelsSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topReels, setTopReels] = useState<TopReel[]>([]);

  // Drafts State & Modals
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [showDraftModal, setShowDraftModal] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftItem | null>(null);
  const [draftFormTitle, setDraftFormTitle] = useState('');
  const [draftFormContent, setDraftFormContent] = useState('');
  const [draftFormContentType, setDraftFormContentType] = useState('reel');
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftFormError, setDraftFormError] = useState<string | null>(null);

  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [publishingDraft, setPublishingDraft] = useState<DraftItem | null>(null);

  // Single Reel Modal
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [singleReel, setSingleReel] = useState<SingleReelAnalytics | null>(null);
  const [loadingSingleReel, setLoadingSingleReel] = useState(false);

  // Quick-Publish & Content Management State
  const [showCreateReelModal, setShowCreateReelModal] = useState(false);
  const [editingReel, setEditingReel] = useState<{ id: string; title: string; content: string } | null>(null);
  const [deletingReelId, setDeletingReelId] = useState<string | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Settings State
  const [category, setCategory] = useState<string>('');
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [togglingMode, setTogglingMode] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/creator/dashboard?period=${period}`);
      const data = res.data;
      if (data && data.success) {
        setModeStatus(data.mode_status);
        if (data.creator_profile) {
          setCreatorProfile(data.creator_profile);
          setCategory(data.creator_profile.creator_category || '');
          setSocials(data.creator_profile.social_links || {});
        }
        if (data.mode_status === 'active') {
          setOverview(data.overview);
          setAudienceGrowth(data.audience_growth || null);
          setReelsSummary(data.reels_summary);
          setTrend(data.trend || []);
          setTopReels(data.top_reels || []);
        }
      } else {
        setError('Failed to load Creator Studio dashboard.');
      }
    } catch (err: any) {
      console.error('Error fetching Creator Studio dashboard:', err);
      setError(err.response?.data?.error || 'Failed to connect to Creator Studio.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDrafts = async () => {
    setLoadingDrafts(true);
    setDraftsError(null);
    try {
      const res = await api.get('/creator/drafts');
      if (res.data && Array.isArray(res.data.drafts)) {
        setDrafts(res.data.drafts);
      }
    } catch (err: any) {
      console.error('Error fetching creator drafts:', err);
      setDraftsError(err.response?.data?.error || 'Failed to load creator drafts.');
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [period]);

  useEffect(() => {
    if (activeTab === 'drafts') {
      fetchDrafts();
    }
  }, [activeTab]);

  const handleOpenCreateDraft = () => {
    setEditingDraft(null);
    setDraftFormTitle('');
    setDraftFormContent('');
    setDraftFormContentType('reel');
    setDraftFormError(null);
    setShowDraftModal(true);
  };

  const handleOpenEditDraft = (draft: DraftItem) => {
    setEditingDraft(draft);
    setDraftFormTitle(draft.title || '');
    setDraftFormContent(draft.content_payload?.content || '');
    setDraftFormContentType(draft.content_type || 'reel');
    setDraftFormError(null);
    setShowDraftModal(true);
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftFormTitle.trim()) {
      setDraftFormError('Title is required.');
      return;
    }
    setSavingDraft(true);
    setDraftFormError(null);
    try {
      const payload = {
        draftId: editingDraft?.id,
        contentType: draftFormContentType,
        title: draftFormTitle.trim(),
        contentPayload: {
          content: draftFormContent.trim(),
        },
        status: editingDraft?.status || 'draft',
      };
      const res = await api.post('/creator/drafts', payload);
      if (res.data && res.data.draft) {
        setShowDraftModal(false);
        await fetchDrafts();
      }
    } catch (err: any) {
      console.error('Error saving draft:', err);
      setDraftFormError(err.response?.data?.error || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!deletingDraftId) return;
    setActionSubmitting(true);
    setActionError(null);
    try {
      await api.delete(`/creator/drafts/${deletingDraftId}`);
      setDeletingDraftId(null);
      await fetchDrafts();
    } catch (err: any) {
      console.error('Error deleting draft:', err);
      setActionError(err.response?.data?.error || 'Failed to delete draft.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleToggleMode = async (enable: boolean) => {
    setTogglingMode(true);
    try {
      const res = await api.post('/creator/mode', { creator_mode_enabled: enable });
      if (res.data && res.data.success) {
        await refreshProfile();
        await fetchDashboard();
      }
    } catch (err: any) {
      console.error('Error toggling creator mode:', err);
      alert(err.response?.data?.error || 'Failed to update Creator Mode status.');
    } finally {
      setTogglingMode(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(null);
    try {
      const res = await api.post('/creator/mode', {
        creator_mode_enabled: true,
        creator_category: category || null,
        social_links: socials
      });
      if (res.data && res.data.success) {
        setSettingsSuccess('Creator Profile updated successfully!');
        await refreshProfile();
        await fetchDashboard();
        setTimeout(() => setSettingsSuccess(null), 4000);
      }
    } catch (err: any) {
      console.error('Error saving creator settings:', err);
      alert(err.response?.data?.error || 'Failed to save creator settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleInspectReel = async (reelId: string) => {
    setSelectedReelId(reelId);
    setLoadingSingleReel(true);
    setSingleReel(null);
    try {
      const res = await api.get(`/creator/reels/${reelId}/analytics`);
      if (res.data && res.data.success && res.data.reel) {
        setSingleReel(res.data.reel);
      }
    } catch (err: any) {
      console.error('Error loading single Reel analytics:', err);
    } finally {
      setLoadingSingleReel(false);
    }
  };

  const handleSaveEditReel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReel) return;
    setActionSubmitting(true);
    setActionError(null);
    try {
      await editPost(editingReel.id, {
        title: editingReel.title.trim() || undefined,
        content: editingReel.content,
      });
      setEditingReel(null);
      await fetchDashboard();
    } catch (err: any) {
      console.error('Error editing Reel:', err);
      setActionError(err.message || 'Failed to update Reel.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleDeleteReel = async () => {
    if (!deletingReelId) return;
    setActionSubmitting(true);
    setActionError(null);
    try {
      await deletePost(deletingReelId);
      setDeletingReelId(null);
      await fetchDashboard();
    } catch (err: any) {
      console.error('Error deleting Reel:', err);
      setActionError(err.message || 'Failed to delete Reel.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const formatWatchTime = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}s`;
    const min = Math.floor(sec / 60);
    const remSec = Math.round(sec % 60);
    return `${min}m ${remSec}s`;
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-muted flex flex-col items-center justify-center gap-3 min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={36} />
        <p className="text-sm font-semibold">Loading Creator Studio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8 bg-red-500/10 border border-red-500/20 text-red-500 rounded-card text-center space-y-4">
        <AlertCircle size={36} className="mx-auto text-red-500" />
        <h3 className="text-lg font-bold">Unable to Load Creator Studio</h3>
        <p className="text-xs text-muted max-w-md mx-auto">{error}</p>
        <button onClick={fetchDashboard} className="px-4 py-2 bg-primary text-white rounded-button text-xs font-bold">
          Retry Connection
        </button>
      </div>
    );
  }

  // State A: Not a Creator
  if (modeStatus === 'not_creator') {
    return (
      <div className="max-w-3xl mx-auto p-8 bg-surface border border-border rounded-card text-center space-y-6 shadow-sm">
        <div className="p-4 rounded-full bg-primary/10 text-primary w-fit mx-auto">
          <Sparkles size={48} />
        </div>
        <div className="space-y-2 max-w-lg mx-auto">
          <h2 className="text-2xl font-extrabold text-heading">Unlock NoteStandard Creator Studio</h2>
          <p className="text-sm text-muted">
            Enable Creator Mode to start building your audience, publishing short video Reels, and inspecting real-time playback analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-4 border-t border-border">
          <div className="p-4 bg-elevated rounded-lg space-y-1">
            <Video size={20} className="text-blue-500" />
            <h4 className="font-bold text-xs text-heading">Reels Analytics</h4>
            <p className="text-[11px] text-muted">Track qualified 2s+ playback views and watch duration.</p>
          </div>
          <div className="p-4 bg-elevated rounded-lg space-y-1">
            <Users size={20} className="text-indigo-500" />
            <h4 className="font-bold text-xs text-heading">Audience Growth</h4>
            <p className="text-[11px] text-muted">Monitor followers gained and unique viewer reach.</p>
          </div>
          <div className="p-4 bg-elevated rounded-lg space-y-1">
            <BarChart2 size={20} className="text-emerald-500" />
            <h4 className="font-bold text-xs text-heading">Engagement Signals</h4>
            <p className="text-[11px] text-muted">Analyze likes, comments, and saves across your content.</p>
          </div>
        </div>

        <button
          onClick={() => handleToggleMode(true)}
          disabled={togglingMode}
          className="px-6 py-3 bg-primary text-white hover:bg-primary-hover font-bold text-sm rounded-button flex items-center justify-center gap-2 mx-auto shadow-md transition-all"
        >
          {togglingMode ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          <span>Enable Creator Mode</span>
        </button>
      </div>
    );
  }

  // State B: Creator Mode Disabled
  if (modeStatus === 'mode_disabled') {
    return (
      <div className="max-w-3xl mx-auto p-8 bg-surface border border-border rounded-card text-center space-y-6 shadow-sm">
        <div className="p-4 rounded-full bg-amber-500/10 text-amber-500 w-fit mx-auto">
          <Lock size={48} />
        </div>
        <div className="space-y-2 max-w-lg mx-auto">
          <h2 className="text-2xl font-extrabold text-heading">Creator Workspace Paused</h2>
          <p className="text-sm text-muted">
            Your Creator Mode is currently turned off in Settings. Reactivate Creator Mode to access your Creator Studio analytics and identity tools.
          </p>
        </div>

        <button
          onClick={() => handleToggleMode(true)}
          disabled={togglingMode}
          className="px-6 py-3 bg-primary text-white hover:bg-primary-hover font-bold text-sm rounded-button flex items-center justify-center gap-2 mx-auto shadow-md transition-all"
        >
          {togglingMode ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          <span>Reactivate Creator Mode</span>
        </button>
      </div>
    );
  }

  // State C: Active Creator Studio
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border p-6 rounded-card shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-heading">Creator Studio</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
              <ShieldCheck size={14} /> Active Creator
            </span>
          </div>
          <p className="text-xs text-muted">
            Category: <strong className="text-heading">{creatorProfile?.creator_category || 'General Creator'}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateReelModal(true)}
            className="px-3.5 py-2 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus size={16} /> + Create Reel
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className="px-3.5 py-2 rounded-button bg-elevated border border-border hover:bg-border text-heading text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Settings size={16} /> Edit Profile & Settings
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <BarChart2 size={16} />
          <span>Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('reels')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${
            activeTab === 'reels'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <Video size={16} />
          <span>Reels Performance</span>
        </button>
        <button
          onClick={() => setActiveTab('drafts')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${
            activeTab === 'drafts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <Edit3 size={16} />
          <span>Drafts & Planner</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${
            activeTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <Settings size={16} />
          <span>Creator Identity</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border p-4 rounded-card space-y-1">
              <div className="flex items-center justify-between text-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Period Views ({period})</span>
                <Eye size={18} className="text-blue-500" />
              </div>
              <div className="text-2xl font-extrabold text-heading">
                {overview.total_views.toLocaleString()}
              </div>
              <p className="text-[10px] text-muted">Qualified 2s+ views in last {period}</p>
            </div>

            <div className="bg-surface border border-border p-4 rounded-card space-y-1">
              <div className="flex items-center justify-between text-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Unique Viewers ({period})</span>
                <Users size={18} className="text-indigo-500" />
              </div>
              <div className="text-2xl font-extrabold text-heading">
                {overview.unique_viewers.toLocaleString()}
              </div>
              <p className="text-[10px] text-muted">Distinct auth & anon viewers</p>
            </div>

            <div className="bg-surface border border-border p-4 rounded-card space-y-1">
              <div className="flex items-center justify-between text-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Followers</span>
                <Users size={18} className="text-emerald-500" />
              </div>
              <div className="text-2xl font-extrabold text-heading">
                {overview.total_followers.toLocaleString()}
              </div>
              <p className="text-[10px] text-muted">+{overview.followers_gained_period} New Followers in {period}</p>
            </div>

            <div className="bg-surface border border-border p-4 rounded-card space-y-1">
              <div className="flex items-center justify-between text-muted">
                <span className="text-[11px] font-bold uppercase tracking-wider">Engagement Rate</span>
                <Sparkles size={18} className="text-yellow-500" />
              </div>
              <div className="text-2xl font-extrabold text-heading">
                {overview.engagement_rate_pct}%
              </div>
              <p className="text-[10px] text-muted">Lifetime interactions / Lifetime views</p>
            </div>
          </div>

          {/* Lifetime Interaction Breakdown */}
          <div className="bg-surface border border-border p-5 rounded-card space-y-4">
            <h3 className="text-sm font-bold text-heading flex items-center gap-2">
              <Heart size={16} className="text-red-500" />
              <span>Lifetime Content Interactions</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-elevated rounded-lg space-y-1">
                <span className="text-xs text-muted font-bold uppercase">Published Reels</span>
                <p className="text-xl font-extrabold text-heading">{overview.total_published_reels}</p>
              </div>
              <div className="p-3 bg-elevated rounded-lg space-y-1">
                <span className="text-xs text-muted font-bold uppercase">Total Likes</span>
                <p className="text-xl font-extrabold text-heading">{overview.total_likes.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-elevated rounded-lg space-y-1">
                <span className="text-xs text-muted font-bold uppercase">Total Comments</span>
                <p className="text-xl font-extrabold text-heading">{overview.total_comments.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-elevated rounded-lg space-y-1">
                <span className="text-xs text-muted font-bold uppercase">Total Saves</span>
                <p className="text-xl font-extrabold text-heading">{overview.total_saves.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Audience & Follower Growth Trend */}
          {audienceGrowth && (
            <div className="bg-surface border border-border p-5 rounded-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-heading flex items-center gap-2">
                  <Users size={16} className="text-emerald-500" />
                  <span>Audience Follower Growth ({period.toUpperCase()})</span>
                </h3>
                <div className="text-xs text-muted">
                  Current Followers: <strong className="text-heading font-extrabold">{audienceGrowth.current_followers.toLocaleString()}</strong> · <strong className="text-emerald-500 font-extrabold">+{audienceGrowth.new_followers_period.toLocaleString()}</strong> New Followers in {period}
                </div>
              </div>

              {audienceGrowth.daily_growth_trend.length > 0 ? (
                <div className="flex items-end gap-1.5 h-32 pt-4 border-b border-border pb-2 overflow-x-auto no-scrollbar">
                  {audienceGrowth.daily_growth_trend.map((pt, idx) => {
                    const maxNew = Math.max(...audienceGrowth.daily_growth_trend.map(t => t.new_followers), 1);
                    const heightPct = Math.max((pt.new_followers / maxNew) * 100, 6);
                    return (
                      <div key={idx} className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-9 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] py-1 px-2 rounded shadow whitespace-nowrap z-10 pointer-events-none">
                          {pt.date}: +{pt.new_followers} new followers
                        </div>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full bg-gradient-to-t from-emerald-600/60 to-emerald-400 rounded-t transition-all group-hover:brightness-125"
                        />
                        <span className="text-[9px] text-muted truncate w-full text-center">
                          {pt.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-muted">
                  No follower activity recorded in this period.
                </div>
              )}
            </div>
          )}

          {/* Monetization Informational Boundary Notice */}
          <div className="p-5 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-card flex items-start gap-4">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg shrink-0 mt-0.5">
              <Info size={20} />
            </div>
            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-heading text-sm flex items-center gap-2">
                <span>Monetization Status:</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-extrabold text-[10px] uppercase">
                  Coming Soon
                </span>
              </h4>
              <p className="text-muted leading-relaxed">
                Creator monetization tools, payout executions, and revenue sharing features are locked during Phase 2 pre-launch. Continue building your Reels portfolio and audience reach!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REELS PERFORMANCE */}
      {activeTab === 'reels' && (
        <div className="space-y-6">
          {/* Period Selector Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border p-4 rounded-card">
            <div className="flex items-center gap-2 font-bold text-sm text-heading">
              <BarChart2 className="text-primary" size={18} />
              <span>Reels Analytics ({period.toUpperCase()})</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateReelModal(true)}
                className="px-3.5 py-2 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus size={16} /> + Create Reel
              </button>
              <div className="flex items-center gap-1 bg-elevated border border-border p-1 rounded-lg">
                {(['7d', '30d', '90d'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      period === p ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-heading'
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {reelsSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface border border-border p-4 rounded-card space-y-1">
                <span className="text-[11px] font-bold uppercase text-muted">Total Watch Time</span>
                <p className="text-2xl font-extrabold text-heading">
                  {formatWatchTime(reelsSummary.total_watch_time_seconds)}
                </p>
                <p className="text-[10px] text-muted">Cumulative watch duration in {period}</p>
              </div>

              <div className="bg-surface border border-border p-4 rounded-card space-y-1">
                <span className="text-[11px] font-bold uppercase text-muted">Avg Watch Duration</span>
                <p className="text-2xl font-extrabold text-heading">
                  {reelsSummary.avg_watch_duration_seconds}s
                </p>
                <p className="text-[10px] text-muted">Per qualified 2s+ playback</p>
              </div>

              <div className="bg-surface border border-border p-4 rounded-card space-y-1">
                <span className="text-[11px] font-bold uppercase text-muted">Authenticated Viewers</span>
                <p className="text-2xl font-extrabold text-heading">
                  {reelsSummary.authenticated_viewers.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted">Logged-in user sessions</p>
              </div>

              <div className="bg-surface border border-border p-4 rounded-card space-y-1">
                <span className="text-[11px] font-bold uppercase text-muted">Anonymous Viewers</span>
                <p className="text-2xl font-extrabold text-heading">
                  {reelsSummary.anonymous_viewers.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted">Guest browser sessions</p>
              </div>
            </div>
          )}

          {/* Daily Views Trend */}
          {trend.length > 0 && (
            <div className="bg-surface border border-border p-5 rounded-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-heading flex items-center gap-2">
                  <Calendar size={16} className="text-primary" />
                  <span>Daily Views Trend ({trend.length} Days)</span>
                </h3>
              </div>
              <div className="flex items-end gap-1.5 h-36 pt-4 border-b border-border pb-2 overflow-x-auto no-scrollbar">
                {trend.map((pt, idx) => {
                  const maxViews = Math.max(...trend.map(t => t.views), 1);
                  const heightPct = Math.max((pt.views / maxViews) * 100, 6);
                  return (
                    <div key={idx} className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] py-1 px-2 rounded shadow whitespace-nowrap z-10 pointer-events-none">
                        {pt.date}: {pt.views} views ({formatWatchTime(pt.watch_time_seconds)})
                      </div>
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-gradient-to-t from-primary/60 to-primary rounded-t transition-all group-hover:brightness-125"
                      />
                      <span className="text-[9px] text-muted truncate w-full text-center">
                        {pt.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Reels Table */}
          <div className="bg-surface border border-border rounded-card overflow-hidden shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-bold text-heading flex items-center gap-2">
              <Video size={16} className="text-primary" />
              <span>Top Performing Reels (Lifetime Views)</span>
            </h3>

            {topReels.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">
                No published Reels found. Create short video notes to see performance metrics here!
              </div>
            ) : (
              <div className="divide-y divide-border border-t border-border">
                {topReels.map(reel => (
                  <div key={reel.id} className="py-3 flex items-center justify-between gap-4 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-14 bg-elevated rounded overflow-hidden flex items-center justify-center shrink-0 border border-border relative">
                        {reel.media_url ? (
                          <video src={reel.media_url} className="w-full h-full object-cover" muted />
                        ) : (
                          <Video size={18} className="text-muted" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-heading truncate group-hover:text-primary transition-colors">
                          {reel.content || 'Untitled Reel'}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          Posted {new Date(reel.created_at).toLocaleDateString()} · {reel.video_duration}s
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 text-right">
                      <div>
                        <p className="text-xs font-bold text-heading">{reel.views_count.toLocaleString()}</p>
                        <p className="text-[10px] text-muted">Views</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-heading">{reel.avg_watch_duration_seconds}s</p>
                        <p className="text-[10px] text-muted">Avg Watch</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleInspectReel(reel.id)}
                          className="px-3 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null);
                            setEditingReel({ id: reel.id, title: '', content: reel.content || '' });
                          }}
                          className="px-2.5 py-1 rounded bg-elevated hover:bg-border text-heading text-xs font-bold transition-all flex items-center gap-1 border border-border"
                          title="Edit Reel Caption & Title"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null);
                            setDeletingReelId(reel.id);
                          }}
                          className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-all flex items-center gap-1 border border-red-500/20"
                          title="Delete Reel"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DRAFTS & CONTENT PLANNER */}
      {activeTab === 'drafts' && (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border p-4 rounded-card">
            <div className="flex items-center gap-2 font-bold text-sm text-heading">
              <Edit3 className="text-primary" size={18} />
              <span>Drafts & Content Planner</span>
            </div>
            <button
              onClick={handleOpenCreateDraft}
              className="px-3.5 py-2 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus size={16} /> + New Draft
            </button>
          </div>

          {loadingDrafts ? (
            <div className="p-12 text-center text-muted flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-xs font-semibold">Loading drafts...</p>
            </div>
          ) : draftsError ? (
            <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-card text-center space-y-3">
              <AlertCircle size={28} className="mx-auto" />
              <p className="text-xs font-semibold">{draftsError}</p>
              <button onClick={fetchDrafts} className="px-3 py-1.5 bg-primary text-white rounded-button text-xs font-bold">
                Retry Loading
              </button>
            </div>
          ) : drafts.length === 0 ? (
            <div className="p-12 bg-surface border border-border rounded-card text-center space-y-4">
              <div className="p-3 rounded-full bg-primary/10 text-primary w-fit mx-auto">
                <Edit3 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-heading">No Drafts Saved Yet</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Save content ideas, Reel scripts, and note drafts before publishing them to NoteStandard.
                </p>
              </div>
              <button
                onClick={handleOpenCreateDraft}
                className="px-4 py-2 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-button inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={16} /> Create Your First Draft
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {drafts.map(draft => (
                <div key={draft.id} className="bg-surface border border-border rounded-card p-5 space-y-3 flex flex-col justify-between hover:border-border-hover transition-all shadow-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-primary/10 text-primary border border-primary/20">
                        {draft.content_type || 'Draft'}
                      </span>
                      <span className="text-[10px] text-muted">
                        Updated {new Date(draft.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-heading line-clamp-1">{draft.title || 'Untitled Draft'}</h4>
                    <p className="text-xs text-muted line-clamp-3 leading-relaxed">
                      {draft.content_payload?.content || 'No content preview available.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                    <button
                      onClick={() => setPublishingDraft(draft)}
                      className="px-3 py-1.5 rounded-button bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all flex items-center gap-1"
                      title="Pre-fill Reel Upload modal with this draft"
                    >
                      <Sparkles size={13} /> Publish as Reel
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditDraft(draft)}
                        className="p-1.5 rounded bg-elevated hover:bg-border text-heading transition-all"
                        title="Edit Draft"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setDeletingDraftId(draft.id)}
                        className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all"
                        title="Delete Draft"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-surface border border-border rounded-card p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-heading flex items-center gap-2">
              <Settings size={18} className="text-primary" />
              <span>Creator Identity & Social Settings</span>
            </h3>
            <p className="text-xs text-muted">Manage your public creator category and verified social platform links.</p>
          </div>

          {settingsSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold rounded-md flex items-center gap-2">
              <CheckCircle2 size={16} /> {settingsSuccess}
            </div>
          )}

          {/* Category Dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-heading">Creator Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full max-w-md px-3 py-2 bg-elevated border border-border rounded-input text-xs font-semibold text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">-- Select Category --</option>
              {CREATOR_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Social Links */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-heading flex items-center gap-1.5">
              <Globe size={14} className="text-primary" /> Social Platform Links (HTTPS Required)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SOCIAL_PLATFORMS.map(p => (
                <div key={p.key} className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">{p.label}</label>
                  <input
                    type="url"
                    placeholder={`https://${p.key}.com/username`}
                    value={socials[p.key] || ''}
                    onChange={e => setSocials({ ...socials, [p.key]: e.target.value })}
                    className="w-full px-3 py-2 bg-elevated border border-border rounded-input text-xs text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleToggleMode(false)}
              disabled={togglingMode}
              className="text-xs font-bold text-red-500 hover:underline"
            >
              Turn Off Creator Mode
            </button>

            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-button flex items-center gap-2 shadow-sm"
            >
              {savingSettings ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* SINGLE REEL ANALYTICS MODAL */}
      {selectedReelId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-6 space-y-5 relative shadow-2xl">
            <button
              onClick={() => setSelectedReelId(null)}
              className="absolute top-4 right-4 text-muted hover:text-heading transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-bold text-heading flex items-center gap-2">
              <Video size={18} className="text-primary" />
              <span>Reel Detailed Analytics</span>
            </h3>

            {loadingSingleReel ? (
              <div className="p-8 text-center text-muted flex flex-col items-center gap-2">
                <Loader2 className="animate-spin text-primary" size={24} />
                <p className="text-xs font-medium">Loading Reel metrics...</p>
              </div>
            ) : !singleReel ? (
              <div className="p-4 text-center text-xs text-red-500 font-semibold">
                Unable to load analytics for this Reel.
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                  <p className="font-bold text-heading truncate">{singleReel.content || 'Untitled Reel'}</p>
                  <p className="text-muted text-[11px]">
                    Published {new Date(singleReel.published_at).toLocaleDateString()} · Duration {singleReel.video_duration}s
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Qualified Views</span>
                    <p className="text-lg font-extrabold text-heading">{singleReel.views_count.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Unique Viewers</span>
                    <p className="text-lg font-extrabold text-heading">{singleReel.unique_viewers.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Total Watch Time</span>
                    <p className="text-lg font-extrabold text-heading">{formatWatchTime(singleReel.total_watch_time_seconds)}</p>
                  </div>
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Avg Watch Duration</span>
                    <p className="text-lg font-extrabold text-heading">{singleReel.avg_watch_duration_seconds}s</p>
                  </div>
                </div>

                <div className="p-3 bg-elevated border border-border rounded-lg space-y-2">
                  <span className="text-muted text-[10px] font-bold uppercase">Lifetime Engagement Breakdown</span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="flex flex-col items-center">
                      <Heart size={16} className="text-red-500 mb-1" />
                      <span className="font-bold text-heading">{singleReel.likes_count}</span>
                      <span className="text-[10px] text-muted">Likes</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <MessageCircle size={16} className="text-blue-500 mb-1" />
                      <span className="font-bold text-heading">{singleReel.comments_count}</span>
                      <span className="text-[10px] text-muted">Comments</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <Bookmark size={16} className="text-yellow-500 mb-1" />
                      <span className="font-bold text-heading">{singleReel.bookmarks_count}</span>
                      <span className="text-[10px] text-muted">Saves</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border flex justify-between items-center text-[11px]">
                    <span className="text-muted">Composite Engagement Rate:</span>
                    <span className="font-extrabold text-heading">{singleReel.engagement_rate_pct}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT REEL CAPTION & TITLE MODAL */}
      {editingReel && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-6 space-y-5 relative shadow-2xl">
            <button
              onClick={() => {
                setEditingReel(null);
                setActionError(null);
              }}
              className="absolute top-4 right-4 text-muted hover:text-heading transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-bold text-heading flex items-center gap-2">
              <Edit3 size={18} className="text-primary" />
              <span>Edit Reel Caption & Title</span>
            </h3>

            {actionError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditReel} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-heading">Reel Title (Optional)</label>
                <input
                  type="text"
                  value={editingReel.title}
                  onChange={e => setEditingReel({ ...editingReel, title: e.target.value })}
                  placeholder="Enter optional reel title..."
                  className="w-full px-3 py-2 bg-elevated border border-border rounded-input text-xs text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-heading">Reel Caption</label>
                <textarea
                  value={editingReel.content}
                  onChange={e => setEditingReel({ ...editingReel, content: e.target.value })}
                  rows={4}
                  placeholder="Update reel caption..."
                  className="w-full px-3 py-2 bg-elevated border border-border rounded-input text-xs text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingReel(null);
                    setActionError(null);
                  }}
                  className="px-4 py-2 rounded-button text-xs font-bold text-muted hover:text-heading border border-border hover:bg-elevated transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className="px-5 py-2 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-button flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                >
                  {actionSubmitting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE REEL CONFIRMATION MODAL */}
      {deletingReelId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-card max-w-sm w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => {
                setDeletingReelId(null);
                setActionError(null);
              }}
              className="absolute top-4 right-4 text-muted hover:text-heading transition-colors"
            >
              <X size={20} />
            </button>

            <div className="p-3 rounded-full bg-red-500/10 text-red-500 w-fit mx-auto">
              <Trash2 size={28} />
            </div>

            <div className="space-y-1 text-center">
              <h3 className="text-base font-bold text-heading">Delete Reel</h3>
              <p className="text-xs text-muted leading-relaxed">
                Are you sure you want to delete this Reel? This action will permanently remove the Reel and its performance history.
              </p>
            </div>

            {actionError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeletingReelId(null);
                  setActionError(null);
                }}
                className="px-4 py-2 rounded-button text-xs font-bold text-muted hover:text-heading border border-border hover:bg-elevated transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReel}
                disabled={actionSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-button flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {actionSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                <span>Delete Reel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAFT CREATE / EDIT MODAL */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setShowDraftModal(false)}
              className="absolute top-4 right-4 text-muted hover:text-heading transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-bold text-heading flex items-center gap-2">
              <Edit3 size={18} className="text-primary" />
              <span>{editingDraft ? 'Edit Draft' : 'Create New Draft'}</span>
            </h3>

            {draftFormError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{draftFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDraft} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-heading">Content Type</label>
                <select
                  value={draftFormContentType}
                  onChange={e => setDraftFormContentType(e.target.value)}
                  className="w-full px-3 py-2 bg-elevated border border-border rounded-input text-xs text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="reel">Reel Video Script / Note</option>
                  <option value="post">Community Post Draft</option>
                  <option value="article">Longform Article Draft</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-heading">Draft Title *</label>
                <input
                  type="text"
                  value={draftFormTitle}
                  onChange={e => setDraftFormTitle(e.target.value)}
                  placeholder="Enter draft title..."
                  className="w-full px-3 py-2 bg-elevated border border-border rounded-input text-xs text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-heading">Content Payload</label>
                <textarea
                  value={draftFormContent}
                  onChange={e => setDraftFormContent(e.target.value)}
                  rows={5}
                  placeholder="Draft content, notes, or script details..."
                  className="w-full px-3 py-2 bg-elevated border border-border rounded-input text-xs text-heading focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  className="px-4 py-2 rounded-button text-xs font-bold text-muted hover:text-heading border border-border hover:bg-elevated transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDraft}
                  className="px-5 py-2 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-button flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                >
                  {savingDraft ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  <span>{editingDraft ? 'Save Changes' : 'Create Draft'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DRAFT CONFIRMATION MODAL */}
      {deletingDraftId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-card max-w-sm w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => {
                setDeletingDraftId(null);
                setActionError(null);
              }}
              className="absolute top-4 right-4 text-muted hover:text-heading transition-colors"
            >
              <X size={20} />
            </button>

            <div className="p-3 rounded-full bg-red-500/10 text-red-500 w-fit mx-auto">
              <Trash2 size={28} />
            </div>

            <div className="space-y-1 text-center">
              <h3 className="text-base font-bold text-heading">Delete Draft</h3>
              <p className="text-xs text-muted leading-relaxed">
                Are you sure you want to delete this draft? This action cannot be undone.
              </p>
            </div>

            {actionError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeletingDraftId(null);
                  setActionError(null);
                }}
                className="px-4 py-2 rounded-button text-xs font-bold text-muted hover:text-heading border border-border hover:bg-elevated transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={actionSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-button flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {actionSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                <span>Delete Draft</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAFT -> REEL PRE-POPULATED PUBLISH MODAL */}
      {publishingDraft && (
        <ReelUploadModal
          initialTitle={publishingDraft.title}
          initialContent={publishingDraft.content_payload?.content}
          draftId={publishingDraft.id}
          onClose={() => setPublishingDraft(null)}
          onSuccess={async () => {
            setPublishingDraft(null);
            await fetchDrafts();
            await fetchDashboard();
          }}
        />
      )}

      {/* REEL UPLOAD MODAL */}
      {showCreateReelModal && (
        <ReelUploadModal
          onClose={() => setShowCreateReelModal(false)}
          onSuccess={async () => {
            setShowCreateReelModal(false);
            await fetchDashboard();
          }}
        />
      )}
    </div>
  );
};

