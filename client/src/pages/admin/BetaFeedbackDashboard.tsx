import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Bug, 
  Star, 
  MessageSquare, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter, 
  RefreshCw, 
  ChevronDown, 
  Monitor, 
  User, 
  Globe, 
  Calendar,
  Save,
  Loader2,
  Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';

interface BetaFeedbackItem {
  id: string;
  user_id: string | null;
  type: 'bug' | 'improvement' | 'rating' | 'other';
  rating: number | null;
  title: string | null;
  comment: string;
  metadata: {
    userAgent?: string;
    screenResolution?: string;
    viewportSize?: string;
    currentUrl?: string;
    isOnline?: boolean;
    appVersion?: string;
    timestamp?: string;
  };
  status: 'new' | 'in_review' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  created_at: string;
  user_profile?: {
    username: string;
    full_name: string;
    avatar_url: string;
  };
}

export const BetaFeedbackDashboard: React.FC = () => {
  const { session } = useAuth();
  const [feedbackList, setFeedbackList] = useState<BetaFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<BetaFeedbackItem | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('beta_feedback')
        .select(`
          *,
          user_profile:profiles!beta_feedback_user_id_fkey(username, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't have foreign key, fetch simple
        const { data: simpleData, error: simpleErr } = await supabase
          .from('beta_feedback')
          .select('*')
          .order('created_at', { ascending: false });

        if (simpleErr) throw simpleErr;
        setFeedbackList(simpleData || []);
      } else {
        setFeedbackList(data || []);
      }
    } catch (err: any) {
      console.warn('[Beta Feedback Dashboard] Fetch fallback:', err.message);
      // Mock seed for display if table empty
      setFeedbackList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: BetaFeedbackItem['status']) => {
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('beta_feedback')
        .update({ 
          status: newStatus,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      setFeedbackList(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
      if (selectedItem?.id === id) {
        setSelectedItem(prev => prev ? { ...prev, status: newStatus } : null);
      }
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } catch (err: any) {
      toast.error('Failed to update status: ' + err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async (id: string) => {
    try {
      const { error } = await supabase
        .from('beta_feedback')
        .update({ admin_notes: adminNoteInput })
        .eq('id', id);

      if (error) throw error;

      setFeedbackList(prev => prev.map(item => item.id === id ? { ...item, admin_notes: adminNoteInput } : item));
      if (selectedItem?.id === id) {
        setSelectedItem(prev => prev ? { ...prev, admin_notes: adminNoteInput } : null);
      }
      toast.success('Admin notes saved');
    } catch (err: any) {
      toast.error('Failed to save notes: ' + err.message);
    }
  };

  // Metrics aggregations
  const metrics = useMemo(() => {
    const total = feedbackList.length;
    const bugs = feedbackList.filter(f => f.type === 'bug');
    const openBugs = bugs.filter(b => b.status === 'new' || b.status === 'in_review').length;
    const improvements = feedbackList.filter(f => f.type === 'improvement').length;
    const ratings = feedbackList.filter(f => f.rating !== null && f.rating !== undefined);
    const avgRating = ratings.length > 0
      ? (ratings.reduce((acc, curr) => acc + (curr.rating || 0), 0) / ratings.length).toFixed(1)
      : '5.0';

    return { total, openBugs, improvements, avgRating, ratingsCount: ratings.length };
  }, [feedbackList]);

  // Filtered feedback
  const filteredList = useMemo(() => {
    return feedbackList.filter(item => {
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesSearch = !searchQuery.trim() || 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.comment.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user_profile?.username?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesType && matchesStatus && matchesSearch;
    });
  }, [feedbackList, typeFilter, statusFilter, searchQuery]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-amber-400" />
            Beta Testing & Feedback Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry, bug triage, and user experience sentiment from Closed Beta testers.
          </p>
        </div>

        <button
          onClick={fetchFeedback}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium transition-colors self-start"
        >
          <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Tester Rating</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{metrics.avgRating}</span>
              <span className="text-xs text-slate-400">/ 5.0</span>
            </div>
            <p className="text-[11px] text-amber-400/90 mt-1 flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {metrics.ratingsCount} verified reviews
            </p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Star className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Open Bug Reports</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-rose-400">{metrics.openBugs}</span>
              <span className="text-xs text-slate-400">active</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Triage required</p>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Bug className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Feature Suggestions</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-blue-400">{metrics.improvements}</span>
              <span className="text-xs text-slate-400">ideas</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">From community testers</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Submissions</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{metrics.total}</span>
              <span className="text-xs text-slate-400">logged</span>
            </div>
            <p className="text-[11px] text-emerald-400 mt-1">Closed Beta v1.0.5</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <MessageSquare className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports, comments, users..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Category Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Categories</option>
            <option value="bug">🐛 Bugs</option>
            <option value="improvement">💡 Suggestions</option>
            <option value="rating">⭐ Ratings</option>
            <option value="other">💬 Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Statuses</option>
            <option value="new">🔴 New</option>
            <option value="in_review">🟡 In Review</option>
            <option value="resolved">🟢 Resolved</option>
            <option value="dismissed">⚪ Dismissed</option>
          </select>
        </div>
      </div>

      {/* Main Content: Split List & Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* List of Feedback (Left 7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
              Loading beta feedback...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <h3 className="text-base font-semibold text-white">No feedback records found</h3>
              <p className="text-xs text-slate-500 mt-1">Adjust your filters or invite more testers to submit reports.</p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedItem(item);
                    setAdminNoteInput(item.admin_notes || '');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {/* Type Badge */}
                      {item.type === 'bug' && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold flex items-center gap-1">
                          <Bug className="w-3 h-3" /> Bug
                        </span>
                      )}
                      {item.type === 'improvement' && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Suggestion
                        </span>
                      )}
                      {item.type === 'rating' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1">
                          <Star className="w-3 h-3" /> Rating ({item.rating}★)
                        </span>
                      )}

                      {/* Status Indicator */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${
                        item.status === 'new' ? 'bg-rose-500/20 text-rose-300' :
                        item.status === 'in_review' ? 'bg-amber-500/20 text-amber-300' :
                        item.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-white mt-2">
                    {item.title || 'Untitled Feedback'}
                  </h3>
                  <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                    {item.comment}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      {item.user_profile?.username || 'Anonymous Tester'}
                    </span>
                    {item.metadata?.currentUrl && (
                      <span className="font-mono text-slate-500 truncate max-w-[200px]">
                        {item.metadata.currentUrl}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Item Detail Pane (Right 5 Cols) */}
        <div className="lg:col-span-5">
          {selectedItem ? (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5 sticky top-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white">Feedback Details</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedItem.status}
                    onChange={(e) => handleUpdateStatus(selectedItem.id, e.target.value as any)}
                    disabled={isUpdatingStatus}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="new">🔴 New</option>
                    <option value="in_review">🟡 In Review</option>
                    <option value="resolved">🟢 Resolved</option>
                    <option value="dismissed">⚪ Dismissed</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Summary Title</span>
                <h4 className="text-sm font-medium text-white mt-0.5">{selectedItem.title || 'Untitled'}</h4>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Description & Comments</span>
                <div className="mt-1 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {selectedItem.comment}
                </div>
              </div>

              {/* Telemetry Diagnostics */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                  Captured Client Telemetry
                </span>
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] font-mono text-slate-300 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Route:</span>
                    <span className="text-amber-400">{selectedItem.metadata?.currentUrl || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Screen Resolution:</span>
                    <span>{selectedItem.metadata?.screenResolution || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Viewport:</span>
                    <span>{selectedItem.metadata?.viewportSize || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">App Version:</span>
                    <span className="text-emerald-400">{selectedItem.metadata?.appVersion || 'v1.0.5'}</span>
                  </div>
                  <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-500 break-all">
                    UA: {selectedItem.metadata?.userAgent || 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Admin Internal Triage Notes */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                  Internal Triage Notes
                </span>
                <textarea
                  rows={3}
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  placeholder="Notes on reproduction, PR link, or assignee..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                />
                <button
                  onClick={() => handleSaveNotes(selectedItem.id)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Notes
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800/60">
              <Monitor className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-xs">Select a feedback item on the left to view device telemetry and triage details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BetaFeedbackDashboard;
