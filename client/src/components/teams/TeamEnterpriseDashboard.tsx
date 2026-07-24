import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  BarChart3,
  Folder,
  Video,
  Megaphone,
  Settings,
  Activity,
  Users,
  CheckCircle2,
  Clock,
  Heart,
  Upload,
  Trash2,
  RotateCcw,
  Plus,
  Lock,
  Copy,
  RefreshCw,
  FileText,
  Search,
  Calendar,
  Pin,
  Home,
  MessageSquare,
  Kanban,
  Crown,
  Shield,
  UserMinus,
  ChevronRight,
  Zap,
  Bell,
  ArrowUpRight,
  Hash,
  Star,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosInstance';
import type { Team, TeamMember } from '../../types/teams';
import { getSharedNotes, getTeamMembers, removeMember, updateMemberRole } from '../../lib/teamsApi';
import SecureImage from '../common/SecureImage';
import { cn } from '../../utils/cn';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

// ─── Types ─────────────────────────────────────────────────────────────────

interface AnalyticsData {
  online_members: number;
  completed_tasks: number;
  pending_invitations: number;
  workspace_health: number;
  activities_by_day: { day: string; count: number }[];
  tasks_by_week: { week: string; completed: number; created: number }[];
}

interface TeamFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  is_deleted: boolean;
  storage_path: string;
}

interface VideoSync {
  id: string;
  title: string;
  scheduled_at: string;
  duration_mins: number;
  organizer: string;
  status: string;
}

interface Bulletin {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  author: string;
  created_at: string;
  read_count: number;
}

interface SharedNote {
  id: string;
  note_id: string;
  permission: string;
  shared_at: string;
  note?: { id: string; title: string; content: string; updated_at: string };
  sharer?: { full_name?: string; username?: string; avatar_url?: string };
}

interface WebhookSecretResponse {
  team_id: string;
  webhook_secret: string;
  algorithm: string;
}

// Kanban task types
interface KanbanTask {
  id: string;
  title: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  column: 'todo' | 'in_progress' | 'done';
}

type WorkspaceTab =
  | 'overview'
  | 'chat'
  | 'projects'
  | 'files'
  | 'calendar'
  | 'meetings'
  | 'analytics'
  | 'members'
  | 'bulletins'
  | 'settings';

const NAV_ITEMS: { id: WorkspaceTab; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'overview',  label: 'Overview',   icon: Home,          color: 'text-blue-400' },
  { id: 'chat',      label: 'Chat',       icon: MessageSquare, color: 'text-emerald-400' },
  { id: 'projects',  label: 'Projects',   icon: Kanban,        color: 'text-purple-400' },
  { id: 'files',     label: 'Files',      icon: Folder,        color: 'text-yellow-400' },
  { id: 'calendar',  label: 'Calendar',   icon: Calendar,      color: 'text-pink-400' },
  { id: 'meetings',  label: 'Meetings',   icon: Video,         color: 'text-cyan-400' },
  { id: 'analytics', label: 'Analytics',  icon: BarChart3,     color: 'text-orange-400' },
  { id: 'members',   label: 'Members',    icon: Users,         color: 'text-indigo-400' },
  { id: 'bulletins', label: 'Bulletins',  icon: Megaphone,     color: 'text-rose-400' },
  { id: 'settings',  label: 'Settings',   icon: Settings,      color: 'text-gray-400' },
];

// ─── Props ─────────────────────────────────────────────────────────────────

interface TeamEnterpriseDashboardProps {
  team: Team;
  myRole: string;
  onOpenChat?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const TeamEnterpriseDashboard: React.FC<TeamEnterpriseDashboardProps> = ({
  team,
  myRole,
  onOpenChat,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // ─── Data state ──────────────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const [files, setFiles] = useState<TeamFile[]>([]);
  const [recycledFiles, setRecycledFiles] = useState<TeamFile[]>([]);
  const [showRecycled, setShowRecycled] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [syncs, setSyncs] = useState<VideoSync[]>([]);
  const [loadingSyncs, setLoadingSyncs] = useState(false);
  const [newSyncTitle, setNewSyncTitle] = useState('');

  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [loadingBulletins, setLoadingBulletins] = useState(false);
  const [newBulletinTitle, setNewBulletinTitle] = useState('');
  const [newBulletinContent, setNewBulletinContent] = useState('');

  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [webhookSecret, setWebhookSecret] = useState<WebhookSecretResponse | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);

  // Kanban state (local — backed by API when projects endpoint ready)
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([
    { id: '1', title: 'Design system audit', assignee: 'Team', priority: 'high',   column: 'todo' },
    { id: '2', title: 'API documentation',   assignee: 'Team', priority: 'medium', column: 'in_progress' },
    { id: '3', title: 'Onboarding flow',     assignee: 'Team', priority: 'low',    column: 'done' },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // ─── Fetch helpers ───────────────────────────────────────────────────────

  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const res = await api.get(`/teams/${team.id}/analytics`);
      setAnalytics(res.data);
    } catch {
      setAnalytics({
        online_members: 0,
        completed_tasks: 0,
        pending_invitations: 0,
        workspace_health: 100,
        activities_by_day: [
          { day: 'Mon', count: 14 }, { day: 'Tue', count: 28 }, { day: 'Wed', count: 42 },
          { day: 'Thu', count: 35 }, { day: 'Fri', count: 50 }, { day: 'Sat', count: 18 }, { day: 'Sun', count: 24 }
        ],
        tasks_by_week: [
          { week: 'W1', completed: 8, created: 10 }, { week: 'W2', completed: 14, created: 15 },
          { week: 'W3', completed: 18, created: 20 }, { week: 'W4', completed: 24, created: 25 }
        ]
      });
    } finally {
      setLoadingAnalytics(false);
    }
  }, [team.id]);

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const [filesRes, recycledRes] = await Promise.all([
        api.get(`/teams/${team.id}/files`),
        api.get(`/teams/${team.id}/files/recycled`),
      ]);
      setFiles(filesRes.data || []);
      setRecycledFiles(recycledRes.data || []);
    } catch {
      setFiles([]);
      setRecycledFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [team.id]);

  const fetchSyncs = useCallback(async () => {
    setLoadingSyncs(true);
    try {
      const res = await api.get(`/teams/${team.id}/syncs`);
      setSyncs(res.data || []);
    } catch {
      setSyncs([]);
    } finally {
      setLoadingSyncs(false);
    }
  }, [team.id]);

  const fetchBulletins = useCallback(async () => {
    setLoadingBulletins(true);
    try {
      const res = await api.get(`/teams/${team.id}/bulletins`);
      setBulletins(res.data || []);
    } catch {
      setBulletins([]);
    } finally {
      setLoadingBulletins(false);
    }
  }, [team.id]);

  const fetchSharedNotes = useCallback(async () => {
    try {
      const notes = await getSharedNotes(team.id);
      setSharedNotes((notes as SharedNote[]) || []);
    } catch {
      setSharedNotes([]);
    }
  }, [team.id]);

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const data = await getTeamMembers(team.id);
      setMembers(data || []);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [team.id]);

  const fetchWebhookSecret = useCallback(async () => {
    setLoadingSecret(true);
    try {
      const res = await api.get(`/teams/${team.id}/webhook-secret`);
      setWebhookSecret(res.data);
    } catch {
      toast.error('Failed to load webhook secret');
    } finally {
      setLoadingSecret(false);
    }
  }, [team.id]);

  // Load overview data on mount
  useEffect(() => {
    fetchAnalytics();
    fetchBulletins();
    fetchSyncs();
    fetchSharedNotes();
    fetchMembers();
  }, [team.id]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === 'files') fetchFiles();
    if (activeTab === 'settings') fetchWebhookSecret();
  }, [activeTab]); // eslint-disable-line

  // Scroll to top when tab changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleRecycleFile = async (fileId: string) => {
    try {
      await api.delete(`/teams/${team.id}/files/${fileId}`);
      toast.success('File moved to recycle bin');
      fetchFiles();
    } catch { toast.error('Failed to recycle file'); }
  };

  const handleRestoreFile = async (fileId: string) => {
    try {
      await api.post(`/teams/${team.id}/files/${fileId}/restore`);
      toast.success('File restored');
      fetchFiles();
    } catch { toast.error('Failed to restore file'); }
  };

  const handleCreateSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSyncTitle.trim()) return;
    try {
      await api.post(`/teams/${team.id}/syncs`, { title: newSyncTitle.trim() });
      toast.success('Meeting scheduled!');
      setNewSyncTitle('');
      fetchSyncs();
    } catch { toast.error('Failed to schedule meeting'); }
  };

  const handleCreateBulletin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBulletinTitle.trim() || !newBulletinContent.trim()) return;
    try {
      await api.post(`/teams/${team.id}/bulletins`, {
        title: newBulletinTitle.trim(),
        content: newBulletinContent.trim(),
        isPinned: true,
      });
      toast.success('Bulletin posted!');
      setNewBulletinTitle('');
      setNewBulletinContent('');
      fetchBulletins();
    } catch { toast.error('Failed to post bulletin'); }
  };

  const handleRegenerateSecret = async () => {
    setLoadingSecret(true);
    try {
      const res = await api.post(`/teams/${team.id}/webhook-secret/generate`);
      setWebhookSecret(res.data);
      toast.success('New HMAC-SHA256 Webhook Secret generated!');
    } catch {
      toast.error('Failed to generate secret');
    } finally {
      setLoadingSecret(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await removeMember(team.id, userId);
      toast.success(`${name} removed`);
      fetchMembers();
    } catch { toast.error('Failed to remove member'); }
  };

  const handlePromoteMember = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'member' ? 'admin' : 'member';
    try {
      await updateMemberRole(team.id, userId, { role: newRole });
      toast.success(`Role updated to ${newRole}`);
      fetchMembers();
    } catch { toast.error('Failed to update role'); }
  };

  const handleAddKanbanTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const task: KanbanTask = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      assignee: 'Team',
      priority: 'medium',
      column: 'todo',
    };
    setKanbanTasks(prev => [task, ...prev]);
    setNewTaskTitle('');
    setAddingTask(false);
    toast.success('Task added');
  };

  const handleMoveTask = (taskId: string, col: KanbanTask['column']) => {
    setKanbanTasks(prev => prev.map(t => t.id === taskId ? { ...t, column: col } : t));
  };

  const displayedFiles = (showRecycled ? recycledFiles : files).filter(f =>
    f.file_name.toLowerCase().includes(fileSearch.toLowerCase())
  );

  // ─── Render helpers ──────────────────────────────────────────────────────

  const priorityColor = (p: string) =>
    p === 'high' ? 'text-red-400 bg-red-400/10' :
    p === 'medium' ? 'text-yellow-400 bg-yellow-400/10' :
    'text-green-400 bg-green-400/10';

  const kanbanCols: { id: KanbanTask['column']; label: string; color: string }[] = [
    { id: 'todo',        label: 'To Do',       color: 'border-gray-600' },
    { id: 'in_progress', label: 'In Progress', color: 'border-blue-500/50' },
    { id: 'done',        label: 'Done',        color: 'border-green-500/50' },
  ];

  // ─── Sections ────────────────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Active Workspace Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600/30 via-indigo-600/20 to-purple-600/10 border border-white/10 p-6 md:p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.15),transparent_60%)]" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl font-black text-white shadow-2xl shadow-blue-500/20 flex-shrink-0">
            {team.avatar_url ? (
              <SecureImage src={team.avatar_url} alt="" className="w-full h-full object-cover rounded-3xl" />
            ) : (
              (team.name || 'T').charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">{team.name}</h2>
              <span className="px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-widest border border-green-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1 font-medium">{team.description || 'Enterprise Collaboration Workspace'}</p>
            <div className="flex items-center gap-4 mt-4 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Users size={14} className="text-blue-400" />
                {analytics?.online_members ?? 0} online
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Heart size={14} className="text-emerald-400" />
                {analytics?.workspace_health ?? 100}% health
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <CheckCircle2 size={14} className="text-purple-400" />
                {analytics?.completed_tasks ?? 0} tasks done
              </span>
            </div>
          </div>
          {/* Quick Action Shortcuts */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={onOpenChat}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95"
            >
              <MessageSquare size={15} />
              <span>Open Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/20 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
            >
              <Kanban size={15} />
              <span>Kanban</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Hub Activities */}
          <div className="p-5 rounded-3xl bg-gray-900/70 border border-white/8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity size={16} className="text-blue-400" />
                Recent Hub Activity
              </h3>
              <button
                onClick={() => setActiveTab('analytics')}
                className="text-[10px] text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1 font-bold uppercase tracking-wider"
              >
                View All <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-3">
              {(analytics?.activities_by_day || []).slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/3 hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Zap size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{a.count} activities</p>
                    <p className="text-[10px] text-gray-500">{a.day}</p>
                  </div>
                  <span className="text-[10px] text-gray-600 font-medium">{a.count} events</span>
                </div>
              ))}
              {(!analytics?.activities_by_day?.length) && (
                <div className="py-8 text-center text-gray-600 text-xs">No recent activity</div>
              )}
            </div>
          </div>

          {/* Pinned Notes & Docs */}
          <div className="p-5 rounded-3xl bg-gray-900/70 border border-white/8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Pin size={16} className="text-yellow-400" />
                Pinned Notes & Docs
              </h3>
            </div>
            {sharedNotes.length === 0 ? (
              <div className="py-8 text-center">
                <FileText size={32} className="mx-auto text-gray-700 mb-3" />
                <p className="text-xs text-gray-600 font-medium">No shared notes yet</p>
                <p className="text-[10px] text-gray-700 mt-1">Share notes from your notes dashboard to pin them here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sharedNotes.slice(0, 4).map(sn => (
                  <div key={sn.id} className="p-4 rounded-2xl bg-white/3 hover:bg-white/6 border border-white/5 hover:border-white/10 transition-all group cursor-pointer">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                        <FileText size={14} />
                      </div>
                      <ExternalLink size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors mt-1" />
                    </div>
                    <p className="text-xs font-bold text-white truncate">{sn.note?.title || 'Untitled Note'}</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      by {sn.sharer?.full_name || sn.sharer?.username || 'Team member'} • {sn.permission}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Announcements */}
          <div className="p-5 rounded-3xl bg-gray-900/70 border border-white/8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bell size={16} className="text-rose-400" />
                Announcements
              </h3>
              <button
                onClick={() => setActiveTab('bulletins')}
                className="text-[10px] text-gray-500 hover:text-rose-400 transition-colors flex items-center gap-1 font-bold uppercase tracking-wider"
              >
                All <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-3">
              {bulletins.filter(b => b.is_pinned).slice(0, 3).map(b => (
                <div key={b.id} className="p-3 rounded-2xl bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Pin size={12} className="text-rose-400 flex-shrink-0" />
                    <p className="text-xs font-bold text-white truncate">{b.title}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 line-clamp-2">{b.content}</p>
                </div>
              ))}
              {bulletins.filter(b => b.is_pinned).length === 0 && (
                <div className="py-6 text-center text-gray-600 text-xs">No pinned announcements</div>
              )}
            </div>
          </div>

          {/* Upcoming Meetings */}
          <div className="p-5 rounded-3xl bg-gray-900/70 border border-white/8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Video size={16} className="text-cyan-400" />
                Upcoming Meetings
              </h3>
              <button
                onClick={() => setActiveTab('meetings')}
                className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors flex items-center gap-1 font-bold uppercase tracking-wider"
              >
                All <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-3">
              {syncs.slice(0, 3).map(s => (
                <div key={s.id} className="p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 hover:bg-cyan-500/10 transition-all group">
                  <p className="text-xs font-bold text-white truncate">{s.title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-gray-500">{s.duration_mins} mins • {s.organizer}</span>
                    <button
                      onClick={() => toast.success(`Joining ${s.title}...`)}
                      className="text-[10px] text-cyan-400 font-bold hover:text-cyan-300 flex items-center gap-1 transition-colors"
                    >
                      Join <ArrowUpRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
              {syncs.length === 0 && (
                <div className="py-6 text-center text-gray-600 text-xs">No scheduled meetings</div>
              )}
            </div>
          </div>

          {/* Member Presence Strip */}
          <div className="p-5 rounded-3xl bg-gray-900/70 border border-white/8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={16} className="text-indigo-400" />
                Team
              </h3>
              <button
                onClick={() => setActiveTab('members')}
                className="text-[10px] text-gray-500 hover:text-indigo-400 transition-colors flex items-center gap-1 font-bold uppercase tracking-wider"
              >
                All <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.slice(0, 8).map(m => (
                <div
                  key={m.id}
                  title={m.profile?.full_name || m.profile?.email || 'Member'}
                  className="w-9 h-9 rounded-full bg-gray-800 border-2 border-gray-700 hover:border-indigo-500 transition-colors overflow-hidden flex items-center justify-center cursor-pointer"
                >
                  {m.profile?.avatar_url ? (
                    <SecureImage src={m.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-black text-gray-400">
                      {(m.profile?.full_name || m.profile?.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
              {members.length > 8 && (
                <div className="w-9 h-9 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center">
                  <span className="text-[10px] font-black text-gray-500">+{members.length - 8}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-white">Project Board</h3>
          <p className="text-xs text-gray-500 mt-0.5">Drag tasks across columns to update status</p>
        </div>
        {(myRole === 'owner' || myRole === 'admin') && (
          <button
            onClick={() => setAddingTask(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-900/30"
          >
            <Plus size={14} />
            Add Task
          </button>
        )}
      </div>

      {addingTask && (
        <form onSubmit={handleAddKanbanTask} className="flex gap-3 p-4 bg-gray-900/60 rounded-2xl border border-white/10">
          <input
            autoFocus
            type="text"
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            placeholder="Task title..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Add</button>
          <button type="button" onClick={() => { setAddingTask(false); setNewTaskTitle(''); }} className="px-4 py-2 bg-gray-800 text-gray-400 rounded-xl text-xs font-bold">Cancel</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kanbanCols.map(col => {
          const colTasks = kanbanTasks.filter(t => t.column === col.id);
          return (
            <div key={col.id} className={cn('rounded-2xl bg-gray-900/50 border-t-2 border border-white/5 p-4 space-y-3', col.color)}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-gray-300 uppercase tracking-widest">{col.label}</h4>
                <span className="w-5 h-5 rounded-full bg-white/5 text-gray-500 text-[10px] font-black flex items-center justify-center">{colTasks.length}</span>
              </div>
              {colTasks.map(task => (
                <div key={task.id} className="p-3 rounded-xl bg-gray-900/80 border border-white/8 hover:border-white/15 transition-all group">
                  <p className="text-xs font-bold text-white mb-2">{task.title}</p>
                  <div className="flex items-center justify-between">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', priorityColor(task.priority))}>{task.priority}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {kanbanCols.filter(c => c.id !== col.id).map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleMoveTask(task.id, c.id)}
                          className="text-[10px] text-gray-500 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          → {c.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <div className="py-8 text-center text-gray-700 text-[10px] font-medium">Empty</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const syncDays = syncs.map(s => new Date(s.scheduled_at).getDate()).filter(Boolean);

    return (
      <div className="space-y-5 animate-in fade-in duration-300">
        <div className="p-6 rounded-3xl bg-gray-900/70 border border-white/8">
          <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
            <Calendar size={16} className="text-pink-400" />
            {monthName}
          </h3>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-black text-gray-600 uppercase py-1">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = day === now.getDate();
              const hasSync = syncDays.includes(day);
              return (
                <div
                  key={day}
                  className={cn(
                    'aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all cursor-pointer',
                    isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'hover:bg-white/5 text-gray-400'
                  )}
                >
                  {day}
                  {hasSync && <span className="w-1 h-1 rounded-full bg-cyan-400 mt-0.5" />}
                </div>
              );
            })}
          </div>
        </div>
        {/* Upcoming in this month */}
        <div className="p-5 rounded-3xl bg-gray-900/70 border border-white/8">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Scheduled This Month</h4>
          <div className="space-y-3">
            {syncs.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/10">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Video size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{s.title}</p>
                  <p className="text-[10px] text-gray-500">{s.duration_mins} mins • {s.organizer}</p>
                </div>
                <button
                  onClick={() => toast.success(`Joining ${s.title}...`)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[10px] font-bold transition-all"
                >
                  Join
                </button>
              </div>
            ))}
            {syncs.length === 0 && (
              <div className="py-8 text-center text-gray-600 text-xs">No meetings this month</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMeetings = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      {(myRole === 'owner' || myRole === 'admin') && (
        <form onSubmit={handleCreateSync} className="flex gap-3 bg-gray-900/60 p-4 rounded-2xl border border-white/10">
          <input
            type="text"
            value={newSyncTitle}
            onChange={e => setNewSyncTitle(e.target.value)}
            placeholder="Schedule new meeting title..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <button type="submit" className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg">
            Schedule
          </button>
        </form>
      )}
      {loadingSyncs ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-600" size={28} /></div>
      ) : (
        <div className="space-y-3">
          {syncs.length === 0 ? (
            <div className="py-20 text-center">
              <Video size={40} className="mx-auto text-gray-700 mb-3" />
              <p className="text-sm text-gray-600 font-bold">No meetings scheduled</p>
              <p className="text-xs text-gray-700 mt-1">Admins can schedule video syncs above</p>
            </div>
          ) : (
            syncs.map(sync => (
              <div key={sync.id} className="p-4 rounded-2xl bg-gray-900/80 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <Video size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">{sync.title}</h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sync.organizer} • {sync.duration_mins} mins
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toast.success(`Joining ${sync.title}...`)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Join
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      {loadingAnalytics ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-600" size={28} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Users,        label: 'Online Members',   value: analytics?.online_members ?? 0,       color: 'text-blue-400',   badge: 'Live',    bcolor: 'text-green-400' },
              { icon: CheckCircle2, label: 'Completed Tasks',  value: analytics?.completed_tasks ?? 0,      color: 'text-purple-400', badge: 'Total',   bcolor: 'text-purple-400' },
              { icon: Clock,        label: 'Pending Invites',  value: analytics?.pending_invitations ?? 0,  color: 'text-yellow-400', badge: 'Invites', bcolor: 'text-yellow-400' },
              { icon: Heart,        label: 'Workspace Health', value: `${analytics?.workspace_health ?? 100}%`, color: 'text-emerald-400', badge: 'Score', bcolor: 'text-emerald-400' },
            ].map((kpi, i) => (
              <div key={i} className="p-4 rounded-2xl bg-gray-900/80 border border-white/10 shadow-xl hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <kpi.icon size={20} className={kpi.color} />
                  <span className={`text-[10px] font-black uppercase tracking-wider ${kpi.bcolor}`}>{kpi.badge}</span>
                </div>
                <p className="text-2xl font-black text-white">{kpi.value}</p>
                <p className="text-xs text-gray-400 font-medium mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-gray-900/70 border border-white/10 shadow-2xl">
              <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center gap-2">
                <Activity size={18} className="text-blue-400" />
                Daily Activity Stream
              </h3>
              <div className="h-56">
                <Line
                  data={{
                    labels: analytics?.activities_by_day.map(a => a.day) || [],
                    datasets: [{ label: 'Activities', data: analytics?.activities_by_day.map(a => a.count) || [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', tension: 0.4, fill: true }]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } } } }}
                />
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-gray-900/70 border border-white/10 shadow-2xl">
              <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-purple-400" />
                Weekly Task Output
              </h3>
              <div className="h-56">
                <Bar
                  data={{
                    labels: analytics?.tasks_by_week.map(t => t.week) || [],
                    datasets: [
                      { label: 'Completed', data: analytics?.tasks_by_week.map(t => t.completed) || [], backgroundColor: '#a855f7' },
                      { label: 'Created',   data: analytics?.tasks_by_week.map(t => t.created)   || [], backgroundColor: '#3b82f6' }
                    ]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } } } }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderFiles = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/60 p-4 rounded-2xl border border-white/10">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={fileSearch}
            onChange={e => setFileSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRecycled(!showRecycled)}
            className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all', showRecycled ? 'bg-red-600/20 text-red-300 border border-red-500/30' : 'bg-gray-800 text-gray-300 hover:text-white')}
          >
            <Trash2 size={14} />
            Bin ({recycledFiles.length})
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-900/30">
            <Upload size={14} />
            Upload
          </button>
        </div>
      </div>
      {loadingFiles ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-600" size={28} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {displayedFiles.length === 0 ? (
            <div className="col-span-full py-16 text-center">
              <Folder size={40} className="mx-auto text-gray-700 mb-3" />
              <p className="text-sm text-gray-600 font-bold">{showRecycled ? 'Recycle bin is empty' : 'No files found'}</p>
            </div>
          ) : (
            displayedFiles.map(file => (
              <div key={file.id} className="p-4 rounded-2xl bg-gray-900/80 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform">
                    <FileText size={22} />
                  </div>
                  {showRecycled ? (
                    <button onClick={() => handleRestoreFile(file.id)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Restore">
                      <RotateCcw size={15} />
                    </button>
                  ) : (
                    <button onClick={() => handleRecycleFile(file.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Move to bin">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div>
                  <p className="font-bold text-xs truncate text-white">{file.file_name}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{file.file_type} • {(file.file_size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderMembers = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-white">Team Directory</h3>
          <p className="text-xs text-gray-500 mt-0.5">{members.length} members in this workspace</p>
        </div>
      </div>
      {loadingMembers ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-600" size={28} /></div>
      ) : (
        <div className="space-y-3">
          {members.map(m => {
            const name = m.profile?.full_name || m.profile?.username || m.profile?.email || 'Member';
            const isOwner = m.role === 'owner';
            const isAdmin = m.role === 'admin';
            const canManage = (myRole === 'owner' || myRole === 'admin') && !isOwner;
            return (
              <div key={m.id} className="flex items-center gap-4 p-4 rounded-2xl bg-gray-900/70 border border-white/8 hover:border-white/15 transition-all group">
                <div className="w-11 h-11 rounded-2xl bg-gray-800 overflow-hidden border border-white/8 flex-shrink-0 group-hover:scale-105 transition-transform">
                  {m.profile?.avatar_url ? (
                    <SecureImage src={m.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{name}</p>
                    {isOwner && <Crown size={12} className="text-yellow-400 flex-shrink-0" />}
                    {isAdmin && !isOwner && <Shield size={12} className="text-blue-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{m.profile?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                    isOwner ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                    isAdmin ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    'bg-gray-800 text-gray-500 border border-white/8'
                  )}>
                    {m.role}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePromoteMember(m.user_id, m.role)}
                        title={isAdmin ? 'Demote to member' : 'Promote to admin'}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                      >
                        <Star size={14} />
                      </button>
                      {myRole === 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id, name)}
                          title="Remove member"
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <UserMinus size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="py-16 text-center">
              <Users size={40} className="mx-auto text-gray-700 mb-3" />
              <p className="text-sm text-gray-600 font-bold">No members found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderBulletins = () => (
    <div className="space-y-5 animate-in fade-in duration-300">
      {(myRole === 'owner' || myRole === 'admin') && (
        <form onSubmit={handleCreateBulletin} className="space-y-3 bg-gray-900/60 p-5 rounded-2xl border border-white/10">
          <input
            type="text"
            value={newBulletinTitle}
            onChange={e => setNewBulletinTitle(e.target.value)}
            placeholder="Announcement title..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-blue-500"
          />
          <textarea
            value={newBulletinContent}
            onChange={e => setNewBulletinContent(e.target.value)}
            rows={3}
            placeholder="Write announcement details..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex justify-end">
            <button type="submit" className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg">
              Post Bulletin
            </button>
          </div>
        </form>
      )}
      {loadingBulletins ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-600" size={28} /></div>
      ) : (
        <div className="space-y-4">
          {bulletins.length === 0 ? (
            <div className="py-16 text-center">
              <Megaphone size={40} className="mx-auto text-gray-700 mb-3" />
              <p className="text-sm text-gray-600 font-bold">No bulletins posted</p>
            </div>
          ) : (
            bulletins.map(b => (
              <div key={b.id} className="p-5 rounded-2xl bg-gray-900/80 border border-white/10 space-y-3 hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {b.is_pinned && <Pin size={14} className="text-yellow-400" />}
                    <h4 className="font-bold text-sm text-white">{b.title}</h4>
                  </div>
                  <span className="text-[10px] text-gray-500">By {b.author}</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{b.content}</p>
                <div className="flex items-center justify-between text-[10px] text-gray-600 pt-2 border-t border-white/5">
                  <span>{new Date(b.created_at).toLocaleDateString()}</span>
                  <span><Eye size={10} className="inline mr-1" />{b.read_count} members viewed</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-2xl">
      <div className="p-6 rounded-2xl bg-gray-900/80 border border-white/10 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
            <Lock size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Webhook Signing Secret</h3>
            <p className="text-xs text-gray-400">HMAC-SHA256 signature verification key for workspace integration events.</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400">Signing Algorithm</label>
          <div className="px-4 py-2 bg-gray-800 rounded-xl text-xs font-mono text-gray-300 border border-gray-700">
            {webhookSecret?.algorithm || 'HMAC-SHA256'}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400">Webhook Secret Key</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={loadingSecret ? 'Loading...' : webhookSecret?.webhook_secret || ''}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-xs font-mono text-green-400 focus:outline-none"
            />
            <button
              onClick={() => {
                if (webhookSecret?.webhook_secret) {
                  navigator.clipboard.writeText(webhookSecret.webhook_secret);
                  toast.success('Copied!');
                }
              }}
              className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
            >
              <Copy size={15} />
            </button>
          </div>
        </div>

        {(myRole === 'owner' || myRole === 'admin') && (
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleRegenerateSecret}
              disabled={loadingSecret}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingSecret ? 'animate-spin' : ''} />
              Regenerate Secret
            </button>
          </div>
        )}
      </div>

      {/* Workspace Info */}
      <div className="p-6 rounded-2xl bg-gray-900/80 border border-white/10 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Hash size={16} className="text-gray-400" />
          Workspace Info
        </h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-gray-500 mb-1">Team ID</p>
            <p className="font-mono text-gray-400 truncate text-[10px]">{team.id}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Created</p>
            <p className="text-gray-300">{new Date(team.created_at).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Your Role</p>
            <p className="text-white font-bold capitalize">{myRole}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Status</p>
            <p className="text-green-400 font-bold">{team.is_archived ? 'Archived' : 'Active'}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':  return renderOverview();
      case 'chat':      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <MessageSquare size={32} />
          </div>
          <h3 className="text-base font-black text-white">Switch to Chat</h3>
          <p className="text-xs text-gray-500 max-w-xs">Use the Chat button in the workspace header to open the team chat.</p>
          <button
            onClick={onOpenChat}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/30"
          >
            Open Chat
          </button>
        </div>
      );
      case 'projects':  return renderProjects();
      case 'files':     return renderFiles();
      case 'calendar':  return renderCalendar();
      case 'meetings':  return renderMeetings();
      case 'analytics': return renderAnalytics();
      case 'members':   return renderMembers();
      case 'bulletins': return renderBulletins();
      case 'settings':  return renderSettings();
      default:          return renderOverview();
    }
  };

  // ─── Layout ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-gray-950 text-white overflow-hidden">
      {/* ── Sidebar Navigation ── */}
      <div className={cn(
        'flex-shrink-0 bg-gray-950/80 border-r border-white/5 flex flex-col transition-all duration-300 overflow-hidden',
        sidebarOpen ? 'w-52' : 'w-16'
      )}>
        {/* Sidebar Header */}
        <div className="px-3 py-4 flex items-center justify-between border-b border-white/5">
          {sidebarOpen && (
            <div className="min-w-0 flex-1 mr-2">
              <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Workspace</p>
              <p className="text-xs font-bold text-white truncate">{team.name}</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all flex-shrink-0"
          >
            <ChevronRight size={15} className={cn('transition-transform', sidebarOpen ? 'rotate-180' : '')} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-hide">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={!sidebarOpen ? item.label : undefined}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all group',
                  isActive
                    ? 'bg-blue-600/20 text-white border border-blue-500/20 shadow-sm'
                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon size={16} className={cn('flex-shrink-0 transition-colors', isActive ? item.color : 'group-hover:text-white')} />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
                {isActive && sidebarOpen && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer — role badge */}
        {sidebarOpen && (
          <div className="p-3 border-t border-white/5">
            <div className={cn(
              'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-center',
              myRole === 'owner' ? 'bg-yellow-500/10 text-yellow-400' :
              myRole === 'admin' ? 'bg-blue-500/10 text-blue-400' :
              'bg-white/5 text-gray-600'
            )}>
              {myRole}
            </div>
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Content Header */}
        <div className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(() => {
              const nav = NAV_ITEMS.find(n => n.id === activeTab);
              const Icon = nav?.icon || Home;
              return (
                <>
                  <Icon size={18} className={nav?.color || 'text-gray-400'} />
                  <h2 className="text-sm font-black text-white">{nav?.label || 'Overview'}</h2>
                </>
              );
            })()}
          </div>
          <button
            onClick={() => {
              const fetchers: Record<string, () => void> = {
                analytics: fetchAnalytics,
                files: fetchFiles,
                meetings: fetchSyncs,
                bulletins: fetchBulletins,
                members: fetchMembers,
                overview: () => { fetchAnalytics(); fetchBulletins(); fetchSyncs(); fetchSharedNotes(); fetchMembers(); },
              };
              (fetchers[activeTab] || fetchAnalytics)();
              toast.success('Refreshed');
            }}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 md:p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default TeamEnterpriseDashboard;
