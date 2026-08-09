import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  ThumbsUp, 
  Search, 
  RefreshCw, 
  Send,
  Loader2,
  MessageSquare,
  Bot
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseSafe';
import type { FeedbackReport } from '../../types/feedback';
import { useFeedbackStore } from '../../stores/useFeedbackStore';

interface FeedbackComment {
  id: string;
  report_id: string;
  author_id: string | null;
  content: string;
  is_internal: boolean;
  is_ai_reply: boolean;
  ai_metadata?: Record<string, unknown>;
  created_at: string;
}

export const UserIssueTracker: React.FC = () => {
  const { user } = useAuth();
  const { userReports, setUserReports, toggleVoteLocally } = useFeedbackStore();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my_reports' | 'roadmap'>('my_reports');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<FeedbackReport | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Comments state
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const fetchUserReports = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) return;
      const { data, error } = await supabase
        .from('beta_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback fetch via REST endpoint
        const res = await fetch('/api/v1/feedback/reports/me');
        const json = await res.json();
        setUserReports(json.data || []);
      } else {
        const formatted: FeedbackReport[] = (data || []).map((item: {
          id: string;
          report_number?: number;
          user_id?: string;
          category_id?: string;
          type?: string;
          priority?: string;
          status?: string;
          roadmap_status?: string;
          title?: string;
          comment?: string;
          description?: string;
          vote_count?: number;
          view_count?: number;
          fixed_in_version?: string;
          resolution_notes?: string;
          admin_notes?: string;
          ai_response?: string;
          created_at: string;
        }) => ({
          id: item.id,
          reportNumber: item.report_number || 101,
          userId: item.user_id || null,
          categoryId: (item.category_id as any) || 'general',
          type: (item.type as any) || 'bug',
          priority: (item.priority as any) || 'medium',
          status: (item.status as any) || 'open',
          roadmapStatus: item.roadmap_status as any,
          title: item.title || 'Untitled Feedback',
          description: item.comment || item.description || '',
          voteCount: item.vote_count || 0,
          viewCount: item.view_count || 0,
          fixedInVersion: item.fixed_in_version,
          resolutionNotes: item.resolution_notes || item.admin_notes,
          createdAt: item.created_at,
          updatedAt: item.created_at,
        }));
        setUserReports(formatted);
      }
    } catch (err: unknown) {
      console.warn('[UserIssueTracker] Fetch fallback:', err);
    } finally {
      setLoading(false);
    }
  }, [user, setUserReports]);

  // Fetch comments for a specific report
  const fetchComments = useCallback(async (reportId: string) => {
    setLoadingComments(true);
    try {
      // Try feedback_comments table (for reports submitted via API)
      const { data: commentsData } = await supabase
        .from('feedback_comments')
        .select('*')
        .eq('report_id', reportId)
        .eq('is_internal', false)
        .order('created_at', { ascending: true });

      setComments(commentsData || []);
    } catch (err) {
      console.warn('[UserIssueTracker] Comments fetch error:', err);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    fetchUserReports();
  }, [fetchUserReports]);

  // Fetch comments when a report is selected
  useEffect(() => {
    if (selectedReport) {
      fetchComments(selectedReport.id);
    } else {
      setComments([]);
    }
  }, [selectedReport, fetchComments]);

  // Scroll to bottom of comments on new message
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // Realtime subscription to new comments for the selected report
  useEffect(() => {
    if (!selectedReport) return;

    const channel = supabase
      .channel(`feedback_comments_${selectedReport.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'feedback_comments',
          filter: `report_id=eq.${selectedReport.id}`,
        },
        (payload) => {
          const newComment = payload.new as FeedbackComment;
          if (!newComment.is_internal) {
            setComments(prev => {
              // Avoid duplicates
              if (prev.find(c => c.id === newComment.id)) return prev;
              return [...prev, newComment];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedReport]);

  const handleVote = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      toggleVoteLocally(reportId);
      await fetch(`/api/v1/feedback/reports/${reportId}/vote`, { method: 'POST' });
      toast.success('Vote recorded!');
    } catch (err) {
      console.error('[UserIssueTracker] Vote error:', err);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !selectedReport) return;
    setIsSubmittingReply(true);

    const optimisticComment: FeedbackComment = {
      id: `optimistic-${Date.now()}`,
      report_id: selectedReport.id,
      author_id: user?.id || null,
      content: replyInput.trim(),
      is_internal: false,
      is_ai_reply: false,
      created_at: new Date().toISOString(),
    };

    // Optimistically add user's comment to UI immediately
    setComments(prev => [...prev, optimisticComment]);
    const inputSnapshot = replyInput.trim();
    setReplyInput('');

    try {
      const { error } = await supabase.from('feedback_comments').insert([{
        report_id: selectedReport.id,
        author_id: user?.id,
        content: inputSnapshot,
        is_internal: false
      }]);

      if (error) throw error;
      toast.success('Reply sent — AI support will respond shortly');
    } catch (err: unknown) {
      // Remove optimistic comment on error
      setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
      setReplyInput(inputSnapshot);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Failed to send reply: ' + msg);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const filteredList = userReports.filter(r => {
    const matchesSearch = !searchQuery || r.title.toLowerCase().includes(searchQuery.toLowerCase()) || r.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'roadmap') {
      return matchesSearch && r.roadmapStatus;
    }
    return matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-amber-400" />
            My Feedback & Issue Tracker
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track your submitted reports, developer replies, fix versions, and upvote community roadmap items.
          </p>
        </div>

        <button
          onClick={fetchUserReports}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium transition-colors self-start"
        >
          <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('my_reports')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'my_reports'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            My Reports ({userReports.length})
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'roadmap'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Public Product Roadmap & Ideas
          </button>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search my feedback..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Main Content Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Reports List (Left 7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
              Loading your feedback tracking history...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <h3 className="text-base font-semibold text-white">No reports found</h3>
              <p className="text-xs text-slate-500 mt-1">Use the floating "Enterprise Feedback" button to submit a report.</p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isSelected = selectedReport?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedReport(item)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${
                        item.status === 'open' ? 'bg-rose-500/20 text-rose-300' :
                        item.status === 'in_progress' ? 'bg-amber-500/20 text-amber-300' :
                        item.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>

                      {item.roadmapStatus && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold uppercase">
                          Roadmap: {item.roadmapStatus}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-500">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-white mt-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                    {item.description}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <button
                      onClick={(e) => handleVote(item.id, e)}
                      className="flex items-center gap-1 hover:text-amber-400 transition-colors"
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${item.hasVoted ? 'text-amber-400 fill-amber-400' : ''}`} />
                      <span>{item.voteCount} Upvotes</span>
                    </button>

                    {item.fixedInVersion && (
                      <span className="text-emerald-400 font-mono text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Fixed in {item.fixedInVersion}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Report Detail & Replies (Right 5 Cols) */}
        <div className="lg:col-span-5">
          {selectedReport ? (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5 sticky top-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-mono text-amber-400">Report #{selectedReport.reportNumber || 101}</span>
                  <h3 className="text-base font-semibold text-white">{selectedReport.title}</h3>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider font-semibold ${
                  selectedReport.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {selectedReport.status}
                </span>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Submitted Description</span>
                <div className="mt-1 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {selectedReport.description}
                </div>
              </div>

              {selectedReport.resolutionNotes && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                  <span className="font-semibold block mb-0.5">Developer Resolution Notes:</span>
                  <p>{selectedReport.resolutionNotes}</p>
                  {selectedReport.fixedInVersion && (
                    <p className="mt-1 text-[11px] font-mono text-emerald-400">
                      Release version: {selectedReport.fixedInVersion}
                    </p>
                  )}
                </div>
              )}

              {/* Developer & AI Support Comment Thread */}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-3">
                  Support Conversation
                </span>

                {/* Comments List */}
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1 mb-3">
                  {loadingComments ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      <span className="ml-2 text-xs text-slate-400">Loading conversation...</span>
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center">
                      <Bot className="w-5 h-5 mx-auto text-teal-400 mb-1.5" />
                      <p className="text-xs text-slate-400">AI Support is processing your report...</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">A response will appear here shortly.</p>
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className={`flex gap-2.5 ${
                        comment.is_ai_reply ? 'flex-row' : 'flex-row-reverse'
                      }`}>
                        {/* Avatar */}
                        <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          comment.is_ai_reply
                            ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                            : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                        }`}>
                          {comment.is_ai_reply ? <Bot className="w-3.5 h-3.5" /> : 'YOU'}
                        </div>

                        {/* Bubble */}
                        <div className={`flex flex-col gap-1 max-w-[85%] ${
                          comment.is_ai_reply ? 'items-start' : 'items-end'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            {comment.is_ai_reply && (
                              <span className="text-[10px] font-semibold text-teal-400">NoteStandard AI</span>
                            )}
                            <span className="text-[10px] text-slate-500">
                              {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={`px-3 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                            comment.is_ai_reply
                              ? 'bg-teal-500/10 border border-teal-500/20 text-teal-100 rounded-tl-none'
                              : 'bg-amber-500/10 border border-amber-500/20 text-amber-100 rounded-tr-none'
                          }`}>
                            {comment.content}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={commentsEndRef} />
                </div>

                {/* Reply Input */}
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <input
                    type="text"
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    placeholder="Add follow-up comment..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingReply || !replyInput.trim()}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50"
                  >
                    {isSubmittingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800/60">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-xs">Select a feedback item on the left to view developer replies and resolution details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserIssueTracker;
