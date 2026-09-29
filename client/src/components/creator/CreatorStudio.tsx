import React, { useState, useEffect } from 'react';
import { FileEdit, CheckCircle, Clock, Search, Plus, Video, Eye, Users, Play, Sparkles, Heart, MessageCircle, Bookmark, BarChart2, Calendar, X, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface Draft {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'outdated';
  content_type: string;
  updated_at: string;
}

interface ReelsSummary {
  total_reels: number;
  total_views: number;
  unique_viewers: number;
  authenticated_viewers: number;
  anonymous_viewers: number;
  total_watch_time_seconds: number;
  avg_watch_duration_seconds: number;
  total_likes: number;
  total_comments: number;
  total_bookmarks: number;
  engagement_rate_pct: number;
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
  const [activeTab, setActiveTab] = useState<'drafts' | 'reels'>('drafts');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [filter, setFilter] = useState('all');
  const [loadingDrafts, setLoadingDrafts] = useState(true);

  // Reels Analytics State
  const [reelsPeriod, setReelsPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [reelsSummary, setReelsSummary] = useState<ReelsSummary | null>(null);
  const [reelsTrend, setReelsTrend] = useState<TrendPoint[]>([]);
  const [topReels, setTopReels] = useState<TopReel[]>([]);
  const [loadingReels, setLoadingReels] = useState(false);
  const [reelsError, setReelsError] = useState<string | null>(null);

  // Single Reel Modal State
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [singleReelAnalytics, setSingleReelAnalytics] = useState<SingleReelAnalytics | null>(null);
  const [loadingSingleReel, setLoadingSingleReel] = useState(false);

  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const res = await api.get('/creator/drafts');
        setDrafts(res.data.drafts || []);
      } catch (err) {
        console.error('Error loading drafts:', err);
      } finally {
        setLoadingDrafts(false);
      }
    };
    fetchDrafts();
  }, []);

  useEffect(() => {
    if (activeTab !== 'reels') return;

    const fetchReelsAnalytics = async () => {
      setLoadingReels(true);
      setReelsError(null);
      try {
        const res = await api.get(`/creator/reels/analytics?period=${reelsPeriod}`);
        if (res.data && res.data.success) {
          setReelsSummary(res.data.summary);
          setReelsTrend(res.data.trend || []);
          setTopReels(res.data.top_reels || []);
        } else {
          setReelsError('Failed to load Reels analytics.');
        }
      } catch (err: any) {
        console.error('Error fetching Reels analytics:', err);
        setReelsError(err.response?.data?.error || 'Failed to load Reels analytics');
      } finally {
        setLoadingReels(false);
      }
    };

    fetchReelsAnalytics();
  }, [activeTab, reelsPeriod]);

  const handleOpenSingleReelModal = async (reelId: string) => {
    setSelectedReelId(reelId);
    setLoadingSingleReel(true);
    setSingleReelAnalytics(null);
    try {
      const res = await api.get(`/creator/reels/${reelId}/analytics`);
      if (res.data && res.data.success && res.data.reel) {
        setSingleReelAnalytics(res.data.reel);
      }
    } catch (err: any) {
      console.error('Error loading single Reel analytics:', err);
    } finally {
      setLoadingSingleReel(false);
    }
  };

  const filteredDrafts = drafts.filter(d => filter === 'all' || d.status === filter);

  const formatWatchTime = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}s`;
    const min = Math.floor(sec / 60);
    const remSec = Math.round(sec % 60);
    return `${min}m ${remSec}s`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">Creator Studio</h1>
          <p className="text-sm text-muted">Manage your content and inspect video performance analytics.</p>
        </div>
        <button className="bg-primary text-white hover:bg-primary-hover px-4 py-2 rounded-button font-bold text-sm flex items-center justify-center gap-2">
          <Plus size={16}/> Create Content
        </button>
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('drafts')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${
            activeTab === 'drafts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <FileEdit size={16} />
          <span>Drafts & Content</span>
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
          <span>Reels Analytics</span>
        </button>
      </div>

      {/* TAB 1: DRAFTS */}
      {activeTab === 'drafts' && (
        <div className="bg-surface border border-border rounded-card overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-2">
              {['all', 'draft', 'published', 'outdated'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-badge text-xs font-semibold capitalize transition-colors ${
                    filter === f ? 'bg-heading text-surface' : 'bg-elevated border border-border text-muted hover:text-heading'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search content..."
                className="pl-9 pr-4 py-2 text-sm bg-elevated border border-border rounded-input focus:outline-none focus:ring-2 focus:ring-primary/50 w-full sm:w-64"
              />
            </div>
          </div>

          <div className="divide-y divide-border">
            {loadingDrafts ? (
              <div className="p-8 text-center text-muted">Loading content...</div>
            ) : filteredDrafts.length === 0 ? (
              <div className="p-12 text-center text-muted">
                No content found. Start creating to build your knowledge base.
              </div>
            ) : (
              filteredDrafts.map(draft => (
                <div key={draft.id} className="p-4 hover:bg-elevated transition-colors flex items-center justify-between group cursor-pointer">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 p-2 rounded-lg ${
                      draft.content_type === 'quiz' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                      draft.content_type === 'flashcard' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      <FileEdit size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-heading text-sm group-hover:text-primary transition-colors">
                        {draft.title || 'Untitled Draft'}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-muted mt-1">
                        <span className="capitalize">{draft.content_type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>Last updated {new Date(draft.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {draft.status === 'published' && <span className="flex items-center gap-1 text-xs font-bold text-success"><CheckCircle size={14}/> Published</span>}
                    {draft.status === 'draft' && <span className="flex items-center gap-1 text-xs font-bold text-muted"><Clock size={14}/> Draft</span>}
                    {draft.status === 'outdated' && <span className="flex items-center gap-1 text-xs font-bold text-warning"><AlertTriangle size={14}/> Needs Update</span>}

                    <button className="opacity-0 group-hover:opacity-100 text-primary font-bold text-xs hover:underline transition-opacity">
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REELS ANALYTICS */}
      {activeTab === 'reels' && (
        <div className="space-y-6">
          {/* Period Selector Toolbar */}
          <div className="flex items-center justify-between bg-surface border border-border p-4 rounded-card">
            <div className="flex items-center gap-2 font-bold text-sm text-heading">
              <BarChart2 className="text-primary" size={18} />
              <span>Performance Overview</span>
            </div>
            <div className="flex items-center gap-1 bg-elevated border border-border p-1 rounded-lg">
              {(['7d', '30d', '90d', 'all'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setReelsPeriod(p)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    reelsPeriod === p ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-heading'
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {loadingReels ? (
            <div className="p-16 text-center text-muted flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-sm font-medium">Fetching Reel Analytics...</p>
            </div>
          ) : reelsError ? (
            <div className="p-8 bg-red-500/10 border border-red-500/20 text-red-500 rounded-card text-center text-sm font-semibold">
              {reelsError}
            </div>
          ) : !reelsSummary || reelsSummary.total_reels === 0 ? (
            <div className="p-16 bg-surface border border-border rounded-card text-center space-y-4">
              <div className="p-4 rounded-full bg-primary/10 text-primary w-fit mx-auto">
                <Video size={40} />
              </div>
              <h3 className="text-base font-bold text-heading">No Reel Analytics Available</h3>
              <p className="text-xs text-muted max-w-md mx-auto">
                You haven't posted any Reels yet. Create and publish short video notes to start tracking viewer engagement and watch time!
              </p>
            </div>
          ) : (
            <>
              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-surface border border-border p-4 rounded-card space-y-2">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Views</span>
                    <Eye size={18} className="text-blue-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-heading">
                    {reelsSummary.total_views.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-muted">Qualified 2s+ playback</p>
                </div>

                <div className="bg-surface border border-border p-4 rounded-card space-y-2">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-bold uppercase tracking-wider">Unique Viewers</span>
                    <Users size={18} className="text-indigo-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-heading">
                    {reelsSummary.unique_viewers.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-muted">
                    {reelsSummary.authenticated_viewers} auth · {reelsSummary.anonymous_viewers} anon
                  </p>
                </div>

                <div className="bg-surface border border-border p-4 rounded-card space-y-2">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Watch Time</span>
                    <Clock size={18} className="text-purple-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-heading">
                    {formatWatchTime(reelsSummary.total_watch_time_seconds)}
                  </div>
                  <p className="text-[11px] text-muted">Cumulative watch duration</p>
                </div>

                <div className="bg-surface border border-border p-4 rounded-card space-y-2">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-bold uppercase tracking-wider">Avg Watch Duration</span>
                    <Play size={18} className="text-emerald-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-heading">
                    {reelsSummary.avg_watch_duration_seconds}s
                  </div>
                  <p className="text-[11px] text-muted">Per qualified view</p>
                </div>

                <div className="bg-surface border border-border p-4 rounded-card space-y-2">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-xs font-bold uppercase tracking-wider">Engagement Rate</span>
                    <Sparkles size={18} className="text-yellow-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-heading">
                    {reelsSummary.engagement_rate_pct}%
                  </div>
                  <p className="text-[11px] text-muted">Likes, comments & saves</p>
                </div>
              </div>

              {/* Trend Chart / Daily Visualizer */}
              {reelsTrend.length > 0 && (
                <div className="bg-surface border border-border p-5 rounded-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-heading flex items-center gap-2">
                      <Calendar size={16} className="text-primary" />
                      <span>Daily Views Trend</span>
                    </h3>
                    <span className="text-xs text-muted font-medium">{reelsTrend.length} days active</span>
                  </div>
                  <div className="flex items-end gap-2 h-32 pt-4 border-b border-border pb-2 overflow-x-auto">
                    {reelsTrend.map((pt, idx) => {
                      const maxViews = Math.max(...reelsTrend.map(t => t.views), 1);
                      const heightPct = Math.max((pt.views / maxViews) * 100, 8);
                      return (
                        <div key={idx} className="flex-1 min-w-[24px] flex flex-col items-center gap-1 group relative">
                          {/* Tooltip */}
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

              {/* Top Performing Reels Table */}
              <div className="bg-surface border border-border rounded-card overflow-hidden shadow-sm space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-heading flex items-center gap-2">
                    <Video size={16} className="text-primary" />
                    <span>Top Performing Reels</span>
                  </h3>
                  <span className="text-xs text-muted">{topReels.length} Reels</span>
                </div>

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
                        <button
                          onClick={() => handleOpenSingleReelModal(reel.id)}
                          className="px-3 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all"
                        >
                          Inspect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
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
            ) : !singleReelAnalytics ? (
              <div className="p-4 text-center text-xs text-red-500 font-semibold">
                Unable to load analytics for this Reel.
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                  <p className="font-bold text-heading truncate">{singleReelAnalytics.content || 'Untitled Reel'}</p>
                  <p className="text-muted text-[11px]">
                    Published {new Date(singleReelAnalytics.published_at).toLocaleDateString()} · Duration {singleReelAnalytics.video_duration}s
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Qualified Views</span>
                    <p className="text-lg font-extrabold text-heading">{singleReelAnalytics.views_count.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Unique Viewers</span>
                    <p className="text-lg font-extrabold text-heading">{singleReelAnalytics.unique_viewers.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Total Watch Time</span>
                    <p className="text-lg font-extrabold text-heading">{formatWatchTime(singleReelAnalytics.total_watch_time_seconds)}</p>
                  </div>
                  <div className="p-3 bg-elevated border border-border rounded-lg space-y-1">
                    <span className="text-muted text-[10px] font-bold uppercase">Avg Watch Duration</span>
                    <p className="text-lg font-extrabold text-heading">{singleReelAnalytics.avg_watch_duration_seconds}s</p>
                  </div>
                </div>

                {/* Engagement Breakdown */}
                <div className="p-3 bg-elevated border border-border rounded-lg space-y-2">
                  <span className="text-muted text-[10px] font-bold uppercase">Engagement Breakdown</span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="flex flex-col items-center">
                      <Heart size={16} className="text-red-500 mb-1" />
                      <span className="font-bold text-heading">{singleReelAnalytics.likes_count}</span>
                      <span className="text-[10px] text-muted">Likes</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <MessageCircle size={16} className="text-blue-500 mb-1" />
                      <span className="font-bold text-heading">{singleReelAnalytics.comments_count}</span>
                      <span className="text-[10px] text-muted">Comments</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <Bookmark size={16} className="text-yellow-500 mb-1" />
                      <span className="font-bold text-heading">{singleReelAnalytics.bookmarks_count}</span>
                      <span className="text-[10px] text-muted">Saves</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border flex justify-between items-center text-[11px]">
                    <span className="text-muted">Composite Engagement Rate:</span>
                    <span className="font-extrabold text-heading">{singleReelAnalytics.engagement_rate_pct}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AlertTriangle = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
);
