import React, { useState, useEffect } from 'react';
import {
  Sparkles, Video, Eye, Users, Play, Heart, MessageCircle, Bookmark,
  BarChart2, Calendar, X, Loader2, Settings, ShieldCheck, CheckCircle2,
  AlertCircle, ArrowRight, Globe, Lock, Info, Plus, PlusCircle, Edit3, Trash2, Activity
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import ReelUploadModal from '../community/ReelUploadModal';
import { PostComposer } from '../community/PostComposer';
import { editPost, deletePost } from '../../services/communityService';
import AiCreatorAssistant, { Suggestion } from './AiCreatorAssistant';

interface ContentInsight {
  node_id: string;
  node_type: string;
  avg_completion_pct: number;
  drop_off_pct: number;
  avg_quiz_accuracy: number;
  ai_question_count: number;
}

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

interface CreatorReadiness {
  overall_score: number;
  active_learners_score?: number;
  completion_rate_score?: number;
  content_quality_score?: number;
  ai_engagement_score?: number;
  publishing_consistency_score?: number;
  community_trust_score?: number;
  is_ready: boolean;
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

interface LearningImpactMetrics {
  quiz_completions: number;
  avg_quiz_score: number | null;
  learning_path_completions: number;
  retention_7d_pct: number | null;
  retention_30d_pct: number | null;
}

interface LearningImpact {
  status: 'available' | 'unavailable';
  metrics: LearningImpactMetrics | null;
}

interface TopAiQuestion {
  question: string;
  count: number;
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
  const [creatorReadiness, setCreatorReadiness] = useState<CreatorReadiness | null>(null);
  const [audienceGrowth, setAudienceGrowth] = useState<AudienceGrowth | null>(null);
  const [learningImpact, setLearningImpact] = useState<LearningImpact | null>(null);
  const [reelsSummary, setReelsSummary] = useState<ReelsSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topReels, setTopReels] = useState<TopReel[]>([]);
  const [topInsights, setTopInsights] = useState<ContentInsight[]>([]);
  const [topAiQuestions, setTopAiQuestions] = useState<TopAiQuestion[]>([]);
  const [draftingQuestionIdx, setDraftingQuestionIdx] = useState<number | null>(null);

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
  const [publishingPostDraft, setPublishingPostDraft] = useState<DraftItem | null>(null);

  // Single Reel Modal
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [singleReel, setSingleReel] = useState<SingleReelAnalytics | null>(null);
  const [loadingSingleReel, setLoadingSingleReel] = useState(false);

  // Quick-Publish & Content Management State
  const [showCreateReelModal, setShowCreateReelModal] = useState(false);
  const [createReelInitialTitle, setCreateReelInitialTitle] = useState<string>('');
  const [createReelInitialContent, setCreateReelInitialContent] = useState<string>('');
  const [editingReel, setEditingReel] = useState<{ id: string; title: string; content: string } | null>(null);
  const [deletingReelId, setDeletingReelId] = useState<string | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleRecommendationAction = async (suggestion: Suggestion) => {
    setActionNotice(null);
    try {
      if (suggestion.type === 'missing_quiz') {
        const firstNode = suggestion.affected_nodes?.[0];
        const title = firstNode?.title ? `Quiz: ${firstNode.title}` : 'New Knowledge Quiz';
        const res = await api.post('/creator/drafts', {
          contentType: 'quiz',
          title,
          contentPayload: {
            content_type: 'quiz',
            target_node_id: firstNode?.id || null,
            target_node_title: firstNode?.title || null,
            note: 'Pre-populated quiz draft generated from Content Health recommendation.'
          },
          status: 'draft'
        });
        if (res.data?.draft) {
          await fetchDrafts();
          setPublishingPostDraft(res.data.draft);
          setActionNotice(`Draft quiz created: "${title}". Opening Post Composer...`);
        }
      } else if (suggestion.type === 'outdated_content') {
        const count = suggestion.affected_count || 1;
        const title = `Flashcard Refresh (${count} set${count > 1 ? 's' : ''})`;
        const res = await api.post('/creator/drafts', {
          contentType: 'flashcard',
          title,
          contentPayload: {
            content_type: 'flashcard',
            affected_count: count,
            note: 'Flashcard set refresh draft generated from Content Health recommendation.'
          },
          status: 'draft'
        });
        if (res.data?.draft) {
          await fetchDrafts();
          setPublishingPostDraft(res.data.draft);
          setActionNotice(`Draft flashcard set created: "${title}". Opening Post Composer...`);
        }
      } else if (suggestion.type === 'high_dropoff') {
        const firstNode = suggestion.affected_nodes?.[0];
        const nodeTitle = firstNode?.node_id ? `Remaster Content (${firstNode.node_id.slice(0, 8)})` : 'Remaster Reel';
        setCreateReelInitialTitle(nodeTitle);
        setCreateReelInitialContent(`Reworking high drop-off content (${firstNode?.drop_off_pct ?? 60}% drop-off detected).`);
        setShowCreateReelModal(true);
        setActionNotice(`Reel Studio opened to remaster high drop-off content.`);
      } else if (suggestion.type === 'weak_concepts') {
        const concepts = suggestion.concepts || [];
        const conceptStr = concepts.slice(0, 2).join(', ') || 'Struggling Concept';
        const title = `Concept Deep Dive: ${conceptStr}`;
        const res = await api.post('/creator/drafts', {
          contentType: 'post',
          title,
          contentPayload: {
            content_type: 'post',
            concepts,
            note: `Targeted post draft addressing struggling learner concepts: ${concepts.join(', ')}.`
          },
          status: 'draft'
        });
        if (res.data?.draft) {
          await fetchDrafts();
          setPublishingPostDraft(res.data.draft);
          setActionNotice(`Draft post created: "${title}". Opening Post Composer...`);
        }
      } else if (suggestion.type === 'search_gap') {
        const gaps = suggestion.search_gaps || [];
        const gapStr = gaps.slice(0, 2).join(', ') || 'Unanswered Search Topic';
        const title = `Content Draft: ${gapStr}`;
        const res = await api.post('/creator/drafts', {
          contentType: 'post',
          title,
          contentPayload: {
            content_type: 'post',
            search_gaps: gaps,
            note: `Targeted post draft addressing unanswered learner search queries: ${gaps.join(', ')}.`
          },
          status: 'draft'
        });
        if (res.data?.draft) {
          await fetchDrafts();
          setPublishingPostDraft(res.data.draft);
          setActionNotice(`Draft post created addressing search gaps: "${title}". Opening Post Composer...`);
        }
      }
    } catch (err: any) {
      console.error('Failed to execute recommendation action:', err);
      setActionNotice(`Action failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleRemediateInsight = async (insight: ContentInsight) => {
    setActionNotice(null);
    setActionError(null);
    setActionSubmitting(true);
    try {
      let title = '';
      let content = '';

      if (typeof insight.ai_question_count === 'number' && insight.ai_question_count > 0) {
        title = `Concept Clarification: ${insight.node_type || 'Node'} (${insight.node_id.slice(0, 8)})`;
        content = `Draft addressing learner confusion (generated ${insight.ai_question_count} AI questions) on ${insight.node_type || 'content'} node (${insight.node_id}).`;
      } else if (typeof insight.drop_off_pct === 'number' && insight.drop_off_pct > 60) {
        title = `Content Revision: ${insight.node_type || 'Node'} (${insight.node_id.slice(0, 8)})`;
        content = `Revision draft to address ${insight.drop_off_pct || 0}% reader drop-off detected on ${insight.node_type || 'content'} node (${insight.node_id}).`;
      } else {
        title = `Content Review: ${insight.node_type || 'Node'} (${insight.node_id.slice(0, 8)})`;
        content = `Review draft for ${insight.node_type || 'content'} node (${insight.node_id}).`;
      }

      const res = await api.post('/creator/drafts', {
        contentType: 'post',
        title,
        contentPayload: {
          content,
          target_node_id: insight.node_id,
          node_type: insight.node_type,
          drop_off_pct: insight.drop_off_pct
        },
        status: 'draft'
      });

      if (res.data?.draft) {
        await fetchDrafts();
        setPublishingPostDraft(res.data.draft);
        setActionNotice(`Draft revision created for node ${insight.node_id.slice(0, 8)}. Opening Post Composer...`);
      }
    } catch (err: any) {
      console.error('Failed to create remediation draft:', err);
      setActionError(err.response?.data?.error || 'Failed to create remediation draft.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleDraftAiQuestionExplanation = async (item: TopAiQuestion, idx: number) => {
    setActionNotice(null);
    setActionError(null);
    setDraftingQuestionIdx(idx);
    try {
      const qText = item.question;
      const title = `FAQ: ${qText.length > 50 ? qText.slice(0, 47) + '...' : qText}`;
      const content = `## Explanation Outline for Learner Question\n\n**Learner Question:** "${qText}"\n*(Asked ${item.count} time${item.count > 1 ? 's' : ''} during the selected period)*\n\n### Key Concepts & Explanation:\n- [Add clear answer/explanation here]\n- [Provide examples or code snippets]\n\n### Summary:\n- [Key takeaways for learners]`;

      const res = await api.post('/creator/drafts', {
        contentType: 'post',
        title,
        contentPayload: {
          content,
          note: `Explanation draft pre-filled for top learner AI question: "${qText}" (${item.count} occurrences).`,
          source_question: qText
        },
        status: 'draft'
      });

      if (res.data && res.data.draft) {
        await fetchDrafts();
        setPublishingPostDraft(res.data.draft);
        setActionNotice(`Draft explanation created for: "${qText.slice(0, 40)}...". Opening Post Composer...`);
      }
    } catch (err: any) {
      console.error('Failed to create AI question explanation draft:', err);
      setActionNotice(`Failed to create draft: ${err.response?.data?.error || err.message}`);
    } finally {
      setDraftingQuestionIdx(null);
    }
  };

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
          setCreatorReadiness(data.creator_readiness || null);
          setAudienceGrowth(data.audience_growth || null);
          setLearningImpact(data.learning_impact || null);
          setReelsSummary(data.reels_summary);
          setTrend(data.trend || []);
          setTopReels(data.top_reels || []);
          setTopInsights(data.top_insights || []);
          setTopAiQuestions(Array.isArray(data.top_ai_questions) ? data.top_ai_questions : []);
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

  const handleCreateReelFollowupDraft = async () => {
    if (!singleReel || actionSubmitting) return;
    setActionSubmitting(true);
    setActionError(null);
    try {
      const reelContent = singleReel.content || 'Untitled Reel';
      const draftTitle = `Follow-up: ${singleReel.content ? singleReel.content.slice(0, 40) : 'Reel'}`;
      const draftContent = `Follow-up to Reel: "${reelContent}"\n\n`;

      const res = await api.post('/creator/drafts', {
        contentType: 'post',
        title: draftTitle,
        contentPayload: {
          content: draftContent,
          target_reel_id: singleReel.id
        },
        status: 'draft'
      });

      if (res.data && res.data.draft) {
        setSelectedReelId(null);
        setPublishingPostDraft(res.data.draft);
      }
    } catch (err: any) {
      console.error('Error creating Reel follow-up draft:', err);
      setActionError(err.response?.data?.error || 'Failed to create follow-up post draft.');
    } finally {
      setActionSubmitting(false);
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

  const getNextAction = () => {
    if (!creatorReadiness) return null;
    const dimensions = [
      { key: 'publishing_consistency_score', label: 'Publishing Consistency', score: creatorReadiness.publishing_consistency_score ?? 0 },
      { key: 'completion_rate_score', label: 'Completion Rate', score: creatorReadiness.completion_rate_score ?? 0 },
      { key: 'content_quality_score', label: 'Content Quality', score: creatorReadiness.content_quality_score ?? 0 },
      { key: 'ai_engagement_score', label: 'AI Engagement', score: creatorReadiness.ai_engagement_score ?? 0 },
      { key: 'community_trust_score', label: 'Community Trust', score: creatorReadiness.community_trust_score ?? 0 },
      { key: 'active_learners_score', label: 'Active Learners', score: creatorReadiness.active_learners_score ?? 0 },
    ];

    const lowest = dimensions.reduce((min, curr) => curr.score < min.score ? curr : min, dimensions[0]);

    if (creatorReadiness.is_ready && lowest.score >= 80) {
      return {
        label: 'All Readiness Dimensions',
        message: 'Your creator readiness is exceptionally high. Keep up the great work!',
        buttonText: 'Publish New Content',
        action: handleOpenCreateDraft,
        icon: <Sparkles size={16} />
      };
    }

    switch (lowest.key) {
      case 'publishing_consistency_score':
        return { label: lowest.label, message: `Your lowest readiness area is ${lowest.label}.`, buttonText: 'Create New Draft', action: handleOpenCreateDraft, icon: <Edit3 size={16} /> };
      case 'completion_rate_score':
        return { label: lowest.label, message: `Your lowest readiness area is ${lowest.label}.`, buttonText: 'Review Drop-Off Insights', action: () => document.getElementById('drop-off-insights')?.scrollIntoView({ behavior: 'smooth' }), icon: <Activity size={16} /> };
      case 'content_quality_score':
        return { label: lowest.label, message: `Your lowest readiness area is ${lowest.label}.`, buttonText: 'Use AI Assistant', action: () => document.getElementById('ai-creator-assistant')?.scrollIntoView({ behavior: 'smooth' }), icon: <Sparkles size={16} /> };
      case 'ai_engagement_score':
        return { label: lowest.label, message: `Your lowest readiness area is ${lowest.label}.`, buttonText: 'Generate Interactive Content', action: () => document.getElementById('ai-creator-assistant')?.scrollIntoView({ behavior: 'smooth' }), icon: <Sparkles size={16} /> };
      case 'community_trust_score':
        return { label: lowest.label, message: `Your lowest readiness area is ${lowest.label}.`, buttonText: 'Publish a Reel', action: () => setShowCreateReelModal(true), icon: <Video size={16} /> };
      case 'active_learners_score':
        return { label: lowest.label, message: `Your lowest readiness area is ${lowest.label}.`, buttonText: 'Publish a Reel', action: () => setShowCreateReelModal(true), icon: <Users size={16} /> };
      default:
        return null;
    }
  };

  const nextAction = getNextAction();

  // State C: Active Creator Studio
  return (
    <div className="max-w-6xl mx-auto space-y-6 w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border p-4 sm:p-6 rounded-card shadow-sm w-full min-w-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-heading">Creator Studio</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 shrink-0">
              <ShieldCheck size={14} /> Active Creator
            </span>
          </div>
          <p className="text-xs text-muted truncate">
            Category: <strong className="text-heading">{creatorProfile?.creator_category || 'General Creator'}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => setShowCreateReelModal(true)}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus size={16} /> + Create Reel
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 rounded-button bg-elevated border border-border hover:bg-border text-heading text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Settings size={16} /> Edit Profile & Settings
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 sm:gap-2 border-b border-border overflow-x-auto no-scrollbar max-w-full shrink-0 pb-0.5">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-3 sm:px-4 font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors border-b-2 shrink-0 whitespace-nowrap ${
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
          className={`pb-3 px-3 sm:px-4 font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors border-b-2 shrink-0 whitespace-nowrap ${
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
          className={`pb-3 px-3 sm:px-4 font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors border-b-2 shrink-0 whitespace-nowrap ${
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
          className={`pb-3 px-3 sm:px-4 font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors border-b-2 shrink-0 whitespace-nowrap ${
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

          {/* Phase 13: Learning Impact & Learner Retention */}
          {learningImpact && (
            <div className="bg-surface border border-border p-5 rounded-card space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-heading flex items-center gap-2">
                  <Activity size={16} className="text-primary" />
                  <span>Learning Impact & Learner Retention</span>
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  learningImpact.status === 'available'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : 'bg-muted/10 text-muted border border-border'
                }`}>
                  {learningImpact.status === 'available' ? 'Snapshot Active' : 'Snapshot Unavailable'}
                </span>
              </div>

              {learningImpact.status === 'available' && learningImpact.metrics ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div className="p-3 bg-elevated rounded-lg space-y-1">
                    <span className="text-[11px] text-muted font-bold uppercase">Quiz Completions</span>
                    <p className="text-xl font-extrabold text-heading">
                      {learningImpact.metrics.quiz_completions.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-elevated rounded-lg space-y-1">
                    <span className="text-[11px] text-muted font-bold uppercase">Avg Quiz Score</span>
                    <p className="text-xl font-extrabold text-heading">
                      {learningImpact.metrics.avg_quiz_score !== null
                        ? `${learningImpact.metrics.avg_quiz_score}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-elevated rounded-lg space-y-1">
                    <span className="text-[11px] text-muted font-bold uppercase">Path Completions</span>
                    <p className="text-xl font-extrabold text-heading">
                      {learningImpact.metrics.learning_path_completions.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-elevated rounded-lg space-y-1">
                    <span className="text-[11px] text-muted font-bold uppercase">7-Day Retention</span>
                    <p className="text-xl font-extrabold text-heading">
                      {learningImpact.metrics.retention_7d_pct !== null
                        ? `${learningImpact.metrics.retention_7d_pct}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-elevated rounded-lg space-y-1">
                    <span className="text-[11px] text-muted font-bold uppercase">30-Day Retention</span>
                    <p className="text-xl font-extrabold text-heading">
                      {learningImpact.metrics.retention_30d_pct !== null
                        ? `${learningImpact.metrics.retention_30d_pct}%`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-muted">
                  Daily learning impact snapshots are being generated. Check back after the next scheduled snapshot.
                </div>
              )}
            </div>
          )}

          {/* Phase 13 Candidate B: Top Learner AI Questions Surface & Content Remediation Bridge */}
          <div className="bg-surface border border-border p-4 sm:p-5 rounded-card space-y-4 shadow-sm w-full min-w-0">
            <div className="flex items-center justify-between pb-3 border-b border-border flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={18} className="text-primary shrink-0" />
                <h3 className="text-sm font-bold text-heading truncate">Top Learner AI Questions ({period.toUpperCase()})</h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 shrink-0">
                <ShieldCheck size={12} /> AI Tutor Telemetry
              </span>
            </div>

            {topAiQuestions.length > 0 ? (
              <div className="space-y-3 min-w-0">
                {topAiQuestions.map((qItem, idx) => (
                  <div key={idx} className="p-3.5 sm:p-4 bg-elevated border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs min-w-0">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                          {qItem.count} Ask{qItem.count > 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] text-muted font-bold shrink-0">Learner Query</span>
                      </div>
                      <p className="text-xs font-semibold text-heading leading-relaxed break-words">
                        "{qItem.question}"
                      </p>
                    </div>

                    <button
                      disabled={draftingQuestionIdx !== null}
                      onClick={() => handleDraftAiQuestionExplanation(qItem, idx)}
                      className="px-3.5 py-2 sm:py-1.5 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 w-full sm:w-auto disabled:opacity-50"
                      title="Create pre-filled explanation draft and open Post Composer"
                    >
                      {draftingQuestionIdx === idx ? (
                        <>
                          <Loader2 className="animate-spin text-white shrink-0" size={13} />
                          <span>Creating Draft...</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle size={13} className="shrink-0" />
                          <span>Draft Explanation</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted bg-elevated rounded-lg space-y-1">
                <p className="font-semibold text-heading">No Learner AI Questions Recorded</p>
                <p className="text-[11px] text-muted">
                  When learners ask the AI Tutor questions about your content during this period, top queries will appear here for targeted content creation.
                </p>
              </div>
            )}
          </div>

          {/* Audience & Follower Growth Trend */}
          {audienceGrowth && (
            <div className="bg-surface border border-border p-4 sm:p-5 rounded-card space-y-4 w-full min-w-0 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
                <h3 className="text-sm font-bold text-heading flex items-center gap-2 truncate">
                  <Users size={16} className="text-emerald-500 shrink-0" />
                  <span className="truncate">Audience Follower Growth ({period.toUpperCase()})</span>
                </h3>
                <div className="text-xs text-muted">
                  Current Followers: <strong className="text-heading font-extrabold">{audienceGrowth.current_followers.toLocaleString()}</strong> · <strong className="text-emerald-500 font-extrabold">+{audienceGrowth.new_followers_period.toLocaleString()}</strong> New Followers in {period}
                </div>
              </div>

              {audienceGrowth.daily_growth_trend.length > 0 ? (
                <div className="flex items-end gap-1 sm:gap-1.5 h-32 pt-4 border-b border-border pb-2 overflow-x-auto no-scrollbar max-w-full">
                  {audienceGrowth.daily_growth_trend.map((pt, idx) => {
                    const maxNew = Math.max(...audienceGrowth.daily_growth_trend.map(t => t.new_followers), 1);
                    const heightPct = Math.max((pt.new_followers / maxNew) * 100, 6);
                    return (
                      <div key={idx} className="flex-1 min-w-[16px] sm:min-w-[20px] flex flex-col items-center gap-1 group relative">
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

          {/* Creator Health & Readiness Score Card */}
          {creatorReadiness && (
            <div className="bg-surface border border-border p-4 sm:p-5 rounded-card space-y-4 shadow-sm w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
                <div className="space-y-1 min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-heading flex items-center gap-2 flex-wrap">
                    <ShieldCheck size={18} className="text-primary shrink-0" />
                    <span>Creator Health & Readiness Index</span>
                  </h3>
                  <p className="text-xs text-muted leading-relaxed">
                    Composite quality score based on publishing consistency, content engagement rate, and audience reach.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-heading">
                      {creatorReadiness.overall_score}
                    </span>
                    <span className="text-xs text-muted"> / 100</span>
                    <p className="text-[10px] text-muted">Overall Health Index</p>
                  </div>
                  <div className={`px-2.5 py-1 rounded text-xs font-bold shrink-0 ${
                    creatorReadiness.is_ready ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-primary/10 text-primary border border-primary/20'
                  }`}>
                    {creatorReadiness.is_ready ? '🟢 High Health' : '🔵 Building Health'}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-elevated overflow-hidden border border-border">
                <div
                  className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(creatorReadiness.overall_score, 100)}%` }}
                />
              </div>

              {/* Sub-scores Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 text-center pt-2">
                <div className="p-2 sm:p-2.5 bg-elevated rounded-lg border border-border space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted font-bold uppercase truncate block" title="Active Learners">Active Learners</span>
                  <p className="text-xs sm:text-sm font-extrabold text-heading truncate">{creatorReadiness.active_learners_score ?? 0} / 100</p>
                </div>
                <div className="p-2 sm:p-2.5 bg-elevated rounded-lg border border-border space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted font-bold uppercase truncate block" title="Completion Rate">Completion</span>
                  <p className="text-xs sm:text-sm font-extrabold text-heading truncate">{creatorReadiness.completion_rate_score ?? 0}%</p>
                </div>
                <div className="p-2 sm:p-2.5 bg-elevated rounded-lg border border-border space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted font-bold uppercase truncate block" title="Content Quality">Quality</span>
                  <p className="text-xs sm:text-sm font-extrabold text-heading truncate">{creatorReadiness.content_quality_score ?? 0} / 100</p>
                </div>
                <div className="p-2 sm:p-2.5 bg-elevated rounded-lg border border-border space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted font-bold uppercase truncate block" title="AI Engagement">AI Engagement</span>
                  <p className="text-xs sm:text-sm font-extrabold text-heading truncate">{creatorReadiness.ai_engagement_score ?? 0} / 100</p>
                </div>
                <div className="p-2 sm:p-2.5 bg-elevated rounded-lg border border-border space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted font-bold uppercase truncate block" title="Consistency">Consistency</span>
                  <p className="text-xs sm:text-sm font-extrabold text-heading truncate">{creatorReadiness.publishing_consistency_score ?? 0} / 100</p>
                </div>
                <div className="p-2 sm:p-2.5 bg-elevated rounded-lg border border-border space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted font-bold uppercase truncate block" title="Community Trust">Trust</span>
                  <p className="text-xs sm:text-sm font-extrabold text-heading truncate">{creatorReadiness.community_trust_score ?? 0} / 100</p>
                </div>
              </div>

              {/* Phase 11: Highest-Impact Next Action Bridge */}
              {nextAction && (
                <div className="pt-4 mt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-heading flex items-center gap-2">
                      <ArrowRight size={14} className="text-primary shrink-0" />
                      <span>Highest-Impact Next Action</span>
                    </h4>
                    <p className="text-[11px] text-muted leading-relaxed">{nextAction.message}</p>
                  </div>
                  <button
                    onClick={nextAction.action}
                    className="px-4 py-2.5 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-button flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0 w-full sm:w-auto"
                  >
                    {nextAction.icon}
                    <span>{nextAction.buttonText}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {actionNotice && (
            <div className="p-3.5 sm:p-4 bg-primary/10 border border-primary/20 rounded-card text-xs flex items-center justify-between text-primary shadow-sm transition-all min-w-0 gap-2">
              <div className="flex items-center gap-2 font-bold min-w-0">
                <CheckCircle2 size={16} className="shrink-0" />
                <span className="truncate">{actionNotice}</span>
              </div>
              <button
                onClick={() => setActionNotice(null)}
                className="text-muted hover:text-heading transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* AI Content Health & Actionable Insights Component */}
          <div id="ai-creator-assistant" className="w-full min-w-0">
            <AiCreatorAssistant onAction={handleRecommendationAction} />
          </div>

          {/* Content Drop-Off & Node Performance Insights */}
          {topInsights.length > 0 && (
            <div id="drop-off-insights" className="bg-surface border border-border p-4 sm:p-5 rounded-card space-y-4 shadow-sm w-full min-w-0">
              <div className="flex items-center justify-between pb-3 border-b border-border flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Activity size={18} className="text-red-500 shrink-0" />
                  <h3 className="text-sm font-bold text-heading truncate">Content Drop-Off & Node Performance Insights</h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
                  Telemetry Analysis
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                {topInsights.map((insight) => (
                  <div key={insight.node_id} className="p-3.5 sm:p-4 bg-elevated border border-border rounded-xl space-y-3 text-xs flex flex-col justify-between min-w-0">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {typeof insight.ai_question_count === 'number' && insight.ai_question_count > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                            High AI Confusion
                          </span>
                        ) : typeof insight.drop_off_pct === 'number' && insight.drop_off_pct > 60 ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
                            High Drop-Off ({insight.drop_off_pct}% Drop-Off)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-500/10 text-slate-500 border border-slate-500/20 shrink-0">
                            Content Review
                          </span>
                        )}
                        <span className="text-[10px] text-muted uppercase font-bold shrink-0">{insight.node_type || 'Node'}</span>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <h4 className="text-xs font-bold text-heading truncate">
                          Node {insight.node_id.slice(0, 8)} ({insight.node_type || 'content'})
                        </h4>
                        <p className="text-[11px] text-muted leading-relaxed">
                          Completion: <strong>{insight.avg_completion_pct}%</strong> · Quiz Accuracy: <strong>{insight.avg_quiz_accuracy}%</strong> · AI Tutor Questions: <strong>{insight.ai_question_count}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                      <button
                        disabled={actionSubmitting}
                        onClick={() => handleRemediateInsight(insight)}
                        className="px-3 py-1.5 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                        title="Create revision draft and open Post Composer"
                      >
                        <Sparkles size={13} className="shrink-0" /> {
                          typeof insight.ai_question_count === 'number' && insight.ai_question_count > 0
                            ? 'Clarify Concept'
                            : typeof insight.drop_off_pct === 'number' && insight.drop_off_pct > 60
                            ? 'Remediate Content'
                            : 'Remediate Content'
                        }
                      </button>
                      <span className="text-[10px] text-muted italic">Pre-fill revision draft</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monetization Informational Boundary Notice */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-card flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg shrink-0 mt-0.5">
              <Info size={20} />
            </div>
            <div className="space-y-1 text-xs min-w-0 flex-1">
              <h4 className="font-bold text-heading text-sm flex items-center gap-2 flex-wrap">
                <span>Monetization Status:</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-extrabold text-[10px] uppercase shrink-0">
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
              <div className="divide-y divide-border border-t border-border min-w-0">
                {topReels.map(reel => (
                  <div key={reel.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 group min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-14 bg-elevated rounded overflow-hidden flex items-center justify-center shrink-0 border border-border relative">
                        {reel.media_url ? (
                          <video src={reel.media_url} className="w-full h-full object-cover" muted />
                        ) : (
                          <Video size={18} className="text-muted shrink-0" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-heading truncate group-hover:text-primary transition-colors">
                          {reel.content || 'Untitled Reel'}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5 truncate">
                          Posted {new Date(reel.created_at).toLocaleDateString()} · {reel.video_duration}s
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 shrink-0 text-right w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-bold text-heading">{reel.views_count.toLocaleString()}</p>
                        <p className="text-[10px] text-muted">Views</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-bold text-heading">{reel.avg_watch_duration_seconds}s</p>
                        <p className="text-[10px] text-muted">Avg Watch</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <button
                          onClick={() => handleInspectReel(reel.id)}
                          className="px-2.5 sm:px-3 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null);
                            setEditingReel({ id: reel.id, title: '', content: reel.content || '' });
                          }}
                          className="px-2 sm:px-2.5 py-1 rounded bg-elevated hover:bg-border text-heading text-xs font-bold transition-all flex items-center gap-1 border border-border"
                          title="Edit Reel Caption & Title"
                        >
                          <Edit3 size={13} className="shrink-0" /> Edit
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null);
                            setDeletingReelId(reel.id);
                          }}
                          className="px-2 sm:px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-all flex items-center gap-1 border border-red-500/20"
                          title="Delete Reel"
                        >
                          <Trash2 size={13} className="shrink-0" /> Delete
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
                      {draft.content_payload?.content || draft.content_payload?.note || 'No content preview available.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['post', 'quiz', 'flashcard', 'wiki'].includes(draft.content_type) && (
                        <button
                          onClick={() => setPublishingPostDraft(draft)}
                          className="px-2.5 py-1.5 rounded-button bg-primary text-white hover:bg-primary-hover text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                          title="Open Post Composer with this draft"
                        >
                          <Globe size={13} /> Publish as Post
                        </button>
                      )}
                      <button
                        onClick={() => setPublishingDraft(draft)}
                        className="px-2.5 py-1.5 rounded-button bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all flex items-center gap-1"
                        title="Pre-fill Reel Upload modal with this draft"
                      >
                        <Sparkles size={13} /> Publish as Reel
                      </button>
                    </div>
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
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-4 sm:p-6 space-y-5 relative shadow-2xl my-auto">
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

                <div className="pt-2 flex flex-col gap-2">
                  {actionError && (
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-[11px]">
                      {actionError}
                    </div>
                  )}
                  <button
                    onClick={handleCreateReelFollowupDraft}
                    disabled={actionSubmitting}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-xs disabled:opacity-50"
                  >
                    {actionSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" size={14} />
                        <span>Creating Draft...</span>
                      </>
                    ) : (
                      <>
                        <PlusCircle size={14} />
                        <span>Create Follow-up Post</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT REEL CAPTION & TITLE MODAL */}
      {editingReel && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-4 sm:p-6 space-y-5 relative shadow-2xl my-auto">
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
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-card max-w-sm w-full p-4 sm:p-6 space-y-4 relative shadow-2xl my-auto">
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
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-card max-w-md w-full p-4 sm:p-6 space-y-4 relative shadow-2xl my-auto">
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
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-card max-w-sm w-full p-4 sm:p-6 space-y-4 relative shadow-2xl my-auto">
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

      {/* DRAFT -> POST PRE-POPULATED PUBLISH MODAL */}
      {publishingPostDraft && (
        <PostComposer
          initialTitle={publishingPostDraft.title || ''}
          initialContent={publishingPostDraft.content_payload?.content || publishingPostDraft.content_payload?.note || ''}
          draftId={publishingPostDraft.id}
          onClose={() => setPublishingPostDraft(null)}
          onPosted={async () => {
            setPublishingPostDraft(null);
            await fetchDrafts();
            await fetchDashboard();
          }}
        />
      )}

      {/* DRAFT -> REEL PRE-POPULATED PUBLISH MODAL */}
      {publishingDraft && (
        <ReelUploadModal
          initialTitle={publishingDraft.title}
          initialContent={publishingDraft.content_payload?.content || publishingDraft.content_payload?.note}
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
          initialTitle={createReelInitialTitle || undefined}
          initialContent={createReelInitialContent || undefined}
          onClose={() => {
            setShowCreateReelModal(false);
            setCreateReelInitialTitle('');
            setCreateReelInitialContent('');
          }}
          onSuccess={async () => {
            setShowCreateReelModal(false);
            setCreateReelInitialTitle('');
            setCreateReelInitialContent('');
            await fetchDashboard();
          }}
        />
      )}
    </div>
  );
};

