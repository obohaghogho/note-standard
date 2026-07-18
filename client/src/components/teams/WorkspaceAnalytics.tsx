import React, { useEffect, useState } from 'react';
import { Pie, Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { getWorkspaceAnalytics } from '../../lib/collaborationApi';
import type { WorkspaceAnalytics as AnalyticsType } from '../../types/collaboration';
import {
  TrendingUp, CheckSquare, MessageSquare, HardDrive,
  RefreshCw, BarChart2, ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

// Register all Chart.js components needed (required in v3+)
ChartJS.register(
  ArcElement,
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
);

// Generate last-7-days day labels
function getLast7DayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
  }
  return labels;
}

interface WorkspaceAnalyticsProps {
  teamId: string;
}

export const WorkspaceAnalytics: React.FC<WorkspaceAnalyticsProps> = ({ teamId }) => {
  const [analytics, setAnalytics] = useState<AnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await getWorkspaceAnalytics(teamId);
      setAnalytics(data);
    } catch {
      toast.error('Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [teamId]);

  // Real chart data from API
  const lineChartData = {
    labels: getLast7DayLabels(),
    datasets: [
      {
        label: 'Daily Activity',
        data: analytics?.activities_by_day || [0, 0, 0, 0, 0, 0, 0],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.07)',
        tension: 0.4,
        fill: true,
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
        data: analytics?.tasks_by_week || [0, 0, 0, 0],
        backgroundColor: 'rgba(16, 185, 129, 0.75)',
        borderRadius: 8,
        borderSkipped: false as const
      }
    ]
  };

  const pieChartData = {
    labels: ['Projects', 'Tasks', 'Messages', 'Members'],
    datasets: [
      {
        label: 'Workspace Assets',
        data: [
          analytics?.projects || 0,
          analytics?.tasks || 0,
          analytics?.messages || 0,
          analytics?.members || 0
        ],
        backgroundColor: [
          'rgba(59, 130, 246, 0.75)',
          'rgba(16, 185, 129, 0.75)',
          'rgba(168, 85, 247, 0.75)',
          'rgba(245, 158, 11, 0.75)'
        ],
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#4b5563', font: { size: 9 } } },
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#4b5563', font: { size: 9 } }, beginAtZero: true }
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full scrollbar-hide bg-black text-white">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h3 className="text-lg font-black italic uppercase tracking-tight flex items-center gap-2">
            <BarChart2 size={18} className="text-primary" /> Workspace Analytics
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Real-time performance metrics and velocity trends</p>
        </div>
        <button onClick={loadAnalytics} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl active:scale-95 transition-all text-gray-400 hover:text-white border border-white/5">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-500 uppercase tracking-widest text-xs font-black">
          Compiling Metrics...
        </div>
      ) : (
        <>
          {/* 6 real stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total Tasks', value: analytics?.tasks ?? 0, color: 'blue', icon: <CheckSquare size={18} /> },
              { label: 'Completed', value: analytics?.completed_tasks ?? 0, color: 'emerald', icon: <CheckSquare size={18} /> },
              { label: 'Messages', value: analytics?.messages ?? 0, color: 'purple', icon: <MessageSquare size={18} /> },
              { label: 'Storage', value: `${((analytics?.storage_bytes || 0) / (1024 * 1024)).toFixed(1)}MB`, color: 'amber', icon: <HardDrive size={18} /> },
              { label: 'Productivity', value: `${analytics?.productivity_score ?? 0}%`, color: 'indigo', icon: <TrendingUp size={18} /> },
              { label: 'Health Score', value: `${analytics?.workspace_health ?? 100}%`, color: 'green', icon: <ShieldCheck size={18} /> }
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="p-5 rounded-[2rem] bg-white/[0.01] border border-white/5 flex flex-col justify-between h-32">
                <div className={`w-9 h-9 rounded-xl bg-${color}-500/10 flex items-center justify-center text-${color}-400`}>
                  {icon}
                </div>
                <div>
                  <div className="text-2xl font-black tracking-tighter italic">{value}</div>
                  <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 flex flex-col gap-6 md:col-span-2">
              <div>
                <h3 className="font-bold text-sm">Daily Workspace Activity</h3>
                <p className="text-[10px] text-gray-500">Log entries per day — last 7 days</p>
              </div>
              <div className="h-56 relative w-full">
                <Line key={`line-${teamId}`} data={lineChartData} options={chartOptions} />
              </div>
            </div>

            <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 flex flex-col gap-6">
              <div>
                <h3 className="font-bold text-sm">Asset Breakdown</h3>
                <p className="text-[10px] text-gray-500">Proportions of workspace resources</p>
              </div>
              <div className="h-56 relative w-full flex items-center justify-center">
                <Pie
                  key={`pie-${teamId}`}
                  data={pieChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                        position: 'bottom',
                        labels: { color: '#9ca3af', font: { size: 9 } }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Weekly task completion bar chart */}
          <div className="p-6 rounded-[2.5rem] bg-white/[0.01] border border-white/5 flex flex-col gap-6">
            <div>
              <h3 className="font-bold text-sm">Weekly Task Completion</h3>
              <p className="text-[10px] text-gray-500">Tasks marked done per week — last 4 weeks</p>
            </div>
            <div className="h-48 relative w-full">
              <Bar key={`bar-${teamId}`} data={barChartData} options={chartOptions} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
export default WorkspaceAnalytics;
