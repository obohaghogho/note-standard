import React, { useEffect, useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { 
  Users, Layers, CheckSquare, HardDrive, ShieldCheck, 
  Activity, TrendingUp, Compass, ChevronRight, Loader2,
  Bell, UserCheck, UserPlus
} from 'lucide-react';
import type { TeamWithUnreadCount } from '../../types/teams';
import { getWorkspaceAnalytics } from '../../lib/collaborationApi';
import type { WorkspaceAnalytics } from '../../types/collaboration';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ExecutiveOverviewProps {
  teams: TeamWithUnreadCount[];
  onSelectTeam: (teamId: string) => void;
}

// Generate last-7-days labels
function getLast7DayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
  }
  return labels;
}

export const ExecutiveOverview: React.FC<ExecutiveOverviewProps> = ({ teams, onSelectTeam }) => {
  // Aggregate analytics from ALL teams in parallel
  const [aggregated, setAggregated] = useState<WorkspaceAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Base stats from team list (always available)
  const totalTeams = teams.length;
  const totalUnread = teams.reduce((acc, t) => acc + (t.unread_count || 0), 0);

  useEffect(() => {
    if (teams.length === 0) return;
    setLoadingAnalytics(true);

    // Fetch analytics for all teams and sum them
    Promise.all(
      teams.map(t => getWorkspaceAnalytics(t.id).catch(() => null))
    ).then(results => {
      const valid = results.filter(Boolean) as WorkspaceAnalytics[];
      if (valid.length === 0) { setLoadingAnalytics(false); return; }

      const merged: WorkspaceAnalytics = {
        members: 0,
        online_members: 0,
        projects: 0,
        tasks: 0,
        completed_tasks: 0,
        messages: 0,
        storage_bytes: 0,
        pending_invitations: 0,
        productivity_score: 0,
        workspace_health: 0,
        activities_by_day: [0, 0, 0, 0, 0, 0, 0],
        tasks_by_week: [0, 0, 0, 0]
      };

      for (const r of valid) {
        merged.members += r.members || 0;
        merged.online_members += r.online_members || 0;
        merged.projects += r.projects || 0;
        merged.tasks += r.tasks || 0;
        merged.completed_tasks += r.completed_tasks || 0;
        merged.messages += r.messages || 0;
        merged.storage_bytes += r.storage_bytes || 0;
        merged.pending_invitations += r.pending_invitations || 0;
        merged.productivity_score += r.productivity_score || 0;
        merged.workspace_health += r.workspace_health || 0;
        if (r.activities_by_day?.length === 7) {
          r.activities_by_day.forEach((v, i) => { merged.activities_by_day[i] += v; });
        }
        if (r.tasks_by_week?.length === 4) {
          r.tasks_by_week.forEach((v, i) => { merged.tasks_by_week[i] += v; });
        }
      }

      // Average the percentage metrics
      merged.productivity_score = Math.round(merged.productivity_score / valid.length);
      merged.workspace_health = Math.round(merged.workspace_health / valid.length);

      setAggregated(merged);
      setLoadingAnalytics(false);
    });
  }, [teams.map(t => t.id).join(',')]);

  const lineChartData = {
    labels: getLast7DayLabels(),
    datasets: [
      {
        fill: true,
        label: 'Workspace Activity',
        data: aggregated?.activities_by_day || [0, 0, 0, 0, 0, 0, 0],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6'
      }
    ]
  };

  const barChartData = {
    labels: ['Wk -3', 'Wk -2', 'Last Wk', 'This Wk'],
    datasets: [
      {
        label: 'Tasks Completed',
        data: aggregated?.tasks_by_week || [0, 0, 0, 0],
        backgroundColor: '#10b981',
        borderRadius: 8
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#fff',
        bodyColor: '#9ca3af',
        padding: 10,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#4b5563', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: { color: '#4b5563', font: { size: 10 } },
        beginAtZero: true
      }
    }
  };

  const statCards = [
    { label: 'Total Teams', value: totalTeams, badge: 'Active', color: 'blue', icon: <Layers size={20} /> },
    { label: 'Workspace Members', value: aggregated?.members ?? '—', badge: `${aggregated?.online_members ?? 0} Online`, color: 'purple', icon: <Users size={20} /> },
    { label: 'Active Tasks', value: aggregated?.tasks ?? '—', badge: `${aggregated?.completed_tasks ?? 0} Done`, color: 'emerald', icon: <CheckSquare size={20} /> },
    { label: 'Pending Invites', value: aggregated?.pending_invitations ?? '—', badge: 'Awaiting', color: 'amber', icon: <UserPlus size={20} /> },
    { label: 'Storage Usage', value: aggregated ? `${((aggregated.storage_bytes) / (1024 * 1024)).toFixed(1)} MB` : '—', badge: 'Cloud', color: 'rose', icon: <HardDrive size={20} /> },
    { label: 'Unread Messages', value: totalUnread, badge: 'New', color: 'indigo', icon: <Bell size={20} /> },
    { label: 'Productivity', value: aggregated ? `${aggregated.productivity_score}%` : '—', badge: 'Score', color: 'green', icon: <TrendingUp size={20} /> },
    { label: 'Hub Health', value: aggregated ? `${aggregated.workspace_health}%` : '—', badge: 'Live', color: 'teal', icon: <ShieldCheck size={20} /> }
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full scrollbar-hide bg-black text-white">
      {/* Welcome Banner */}
      <div className="relative p-8 rounded-[2.5rem] overflow-hidden border border-white/5 bg-gradient-to-br from-gray-900 via-gray-950 to-black shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 blur-[120px] rounded-full"></div>
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent uppercase tracking-tight italic">
              Organization Overview
            </h1>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest leading-loose max-w-xl">
              Monitor overall team velocity, task status, projects growth, and workspace compliance logs across all active workspaces.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center min-w-[80px]">
              {loadingAnalytics ? (
                <Loader2 size={20} className="animate-spin text-primary mx-auto" />
              ) : (
                <div className="text-2xl font-black text-primary italic">{aggregated?.productivity_score ?? 0}%</div>
              )}
              <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-1">Velocity Score</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center min-w-[80px]">
              {loadingAnalytics ? (
                <Loader2 size={20} className="animate-spin text-green-400 mx-auto" />
              ) : (
                <div className="text-2xl font-black text-green-400 italic">{aggregated?.workspace_health ?? 100}%</div>
              )}
              <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-1">Hub Health</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid Stats — all real data */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, badge, color, icon }) => (
          <div key={label} className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all flex flex-col justify-between h-36 group">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 flex items-center justify-center text-${color}-400 group-hover:scale-105 transition-transform`}>
                {icon}
              </div>
              <span className={`text-[9px] font-black text-${color}-400 bg-${color}-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider`}>
                {badge}
              </span>
            </div>
            <div>
              <div className="text-3xl font-black tracking-tighter italic">
                {loadingAnalytics && value === '—' ? <Loader2 size={20} className="animate-spin text-gray-500" /> : value}
              </div>
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section — real data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                <Activity size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm">Daily Team Activity</h3>
                <p className="text-[10px] text-gray-500">Log entries per day — last 7 days</p>
              </div>
            </div>
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-xl">7 Days</span>
          </div>
          <div className="h-48 w-full relative">
            <Line key="exec-line" data={lineChartData} options={chartOptions} />
          </div>
        </div>

        <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                <TrendingUp size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm">Productivity Growth</h3>
                <p className="text-[10px] text-gray-500">Tasks completed weekly — last 4 weeks</p>
              </div>
            </div>
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-xl">4 Weeks</span>
          </div>
          <div className="h-48 w-full relative">
            <Bar key="exec-bar" data={barChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Active Workspaces Directory */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] pl-1 flex items-center gap-2">
          <Compass size={14} /> My Teams Workspace Directory
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((team) => (
            <div 
              key={team.id}
              onClick={() => onSelectTeam(team.id)}
              className="p-5 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-primary/20 hover:bg-primary/[0.02] transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-lg overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                  {team.avatar_url ? (
                    <img src={team.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (team.name || 'T').charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-white group-hover:text-primary transition-colors truncate">{team.name}</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate mt-0.5">
                    {team.member_count} Members • {team.unread_count > 0 ? `${team.unread_count} unread` : team.description || 'Workspace'}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-600 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default ExecutiveOverview;
