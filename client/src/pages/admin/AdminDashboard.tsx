import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Users,
    FileText,
    MessageSquare,
    TrendingUp,
    Activity as ActivityIcon,
    Server,
    Clock,
    AlertCircle,
    Cpu,
    Database,
    Trophy,
    Wifi,
    CheckCircle,
    Bell,
    Wallet,
    ShieldAlert,
    ShieldCheck,
    ArrowRight
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import { Card } from '../../components/common/Card';
import PullToRefresh from '../../components/common/PullToRefresh';
import EmptyStateCard from '../../components/common/EmptyStateCard';
import './AdminDashboard.css';

interface TopCreator {
    id: string;
    name: string;
    avatar?: string;
    count: number;
}

interface Trend {
    day: string;
    notes: number;
    users: number;
}

interface SystemMetrics {
    cpu: number;
    memory: number;
}

interface Stats {
    totalUsers: number;
    activeUsers: number;
    totalNotes: number;
    openChats: number;
    pendingChats: number;
    onlineUsers: number;
    totalMessages?: number;
    serverStatus: string;
    topCreators?: TopCreator[];
    usageTrends?: Trend[];
    systemLoad?: SystemMetrics;
}

export const AdminDashboard = () => {
    const { session } = useAuth();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/stats`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) throw new Error('Failed to fetch stats');

            const data = await res.json();
            setStats(data);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [session?.access_token]);

    useEffect(() => {
        fetchStats();
        // Refresh stats every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    if (loading) {
        return (
            <div className="admin-dashboard loading">
                <div className="loader" />
                <p>Loading dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 sm:p-6">
                <EmptyStateCard 
                    icon={AlertCircle}
                    title="Failed to Load Dashboard"
                    description={error}
                    actionLabel="Retry Loading"
                    onAction={fetchStats}
                />
            </div>
        );
    }

    const statCards = [
        {
            label: 'Total Users',
            value: stats?.totalUsers || 0,
            icon: Users,
            color: 'blue'
        },
        {
            label: 'Active Users (24h)',
            value: stats?.activeUsers || 0,
            icon: ActivityIcon,
            color: 'green'
        },
        {
            label: 'Total Notes',
            value: stats?.totalNotes || 0,
            icon: FileText,
            color: 'purple'
        },
        {
            label: 'Total Messages',
            value: stats?.totalMessages || 0,
            icon: MessageSquare,
            color: 'indigo'
        },
        {
            label: 'Open Chats',
            value: stats?.openChats || 0,
            icon: MessageSquare,
            color: 'orange',
            urgent: true
        },
        {
            label: 'Pending Chats',
            value: stats?.pendingChats || 0,
            icon: Clock,
            color: 'yellow'
        },
        {
            label: 'Online Now',
            value: stats?.onlineUsers || 0,
            icon: Wifi,
            color: 'cyan',
            live: true
        },
    ];

    // Find max value for charts scaling
    const maxTrendValue = stats?.usageTrends
        ? Math.max(...stats.usageTrends.map(d => Math.max(d.notes, d.users)), 10)
        : 10;

    return (
        <PullToRefresh onRefresh={fetchStats}>
            <div className="admin-dashboard px-2 sm:px-4 py-3">
                <div className="dashboard-header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Dashboard Overview</h2>
                    <div className="server-status inline-flex items-center gap-2 self-start sm:self-auto">
                        <Server size={16} />
                        <span className={`status ${stats?.serverStatus === 'healthy' ? 'healthy' : 'issues'}`}>
                            Server: {stats?.serverStatus || 'Unknown'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    {statCards.map((card) => (
                        <div key={card.label} className={`stat-card ${card.color} p-4 rounded-xl flex items-center justify-between border border-white/5`}>
                            <div className="flex items-center gap-3">
                                <div className="stat-icon p-3 rounded-lg bg-white/5">
                                    <card.icon size={22} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-value text-xl font-bold text-white flex items-center gap-1.5">
                                        {card.value.toLocaleString()}
                                        {card.live && <span className="live-dot" />}
                                    </span>
                                    <span className="stat-label text-xs text-gray-400">{card.label}</span>
                                </div>
                            </div>
                            {card.urgent && card.value > 0 && (
                                <span className="stat-urgent text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-semibold">Needs attention</span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Operational System Health & Control Panels */}
                <div className="my-6">
                    <h3 className="text-sm sm:text-base font-bold text-gray-200 mb-3 flex items-center gap-2">
                        <ActivityIcon size={18} className="text-blue-400" />
                        Operational Tools & System Controls
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        <Link to="/admin/push-health" className="p-4 rounded-xl bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border border-blue-500/20 hover:border-blue-500/50 transition-all group flex flex-col justify-between min-h-[140px]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
                                    <Bell size={20} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">Live Diagnostics</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">Push Health & Delivery</h4>
                                <p className="text-xs text-gray-400 mt-1">User notification coverage dashboard and subscription audit.</p>
                            </div>
                            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-400 group-hover:translate-x-1 transition-transform">
                                <span>Open Push Dashboard</span>
                                <ArrowRight size={14} />
                            </div>
                        </Link>

                        <Link to="/admin/fincra" className="p-4 rounded-xl bg-gradient-to-br from-purple-900/30 to-pink-900/20 border border-purple-500/20 hover:border-purple-500/50 transition-all group flex flex-col justify-between min-h-[140px]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
                                    <Wallet size={20} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Financial Audit</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">Fincra Settlement Audit</h4>
                                <p className="text-xs text-gray-400 mt-1">Webhook logs, SHA-512 verification status, and audit trail.</p>
                            </div>
                            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition-transform">
                                <span>Open Fincra Audit</span>
                                <ArrowRight size={14} />
                            </div>
                        </Link>

                        <Link to="/admin/reconciliation" className="p-4 rounded-xl bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-500/20 hover:border-emerald-500/50 transition-all group flex flex-col justify-between min-h-[140px]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                                    <ShieldAlert size={20} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Ledger Control</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">NFI Control & Ledger</h4>
                                <p className="text-xs text-gray-400 mt-1">Non-Fungible Ledger drift detection and health monitoring.</p>
                            </div>
                            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
                                <span>Open NFI Control</span>
                                <ArrowRight size={14} />
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Data Sections: Usage Trends, Top Creators, System Load */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 mt-6">

                    {/* Usage Trends Chart */}
                    <Card variant="glass" className="lg:col-span-2 p-4 sm:p-6 flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                                <TrendingUp size={20} className="text-blue-400" />
                                Usage Trends (7 Days)
                            </h3>
                            <div className="flex gap-4 text-xs font-medium text-gray-300">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Users
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Notes
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 flex items-end justify-between gap-2 sm:gap-4 h-48 px-1 sm:px-2">
                            {stats?.usageTrends?.map((trend) => (
                                <div key={trend.day} className="flex flex-col items-center gap-2 w-full h-full justify-end group">
                                    <div className="w-full flex gap-1 items-end justify-center h-full">
                                        {/* Users Bar */}
                                        <div
                                            className="w-2.5 sm:w-5 bg-blue-500/60 rounded-t-sm hover:bg-blue-500 transition-all relative group-hover:shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                            style={{ height: `${(trend.users / maxTrendValue) * 100}%` }}
                                        >
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-black/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 text-white">
                                                {trend.users} users
                                            </div>
                                        </div>
                                        {/* Notes Bar */}
                                        <div
                                            className="w-2.5 sm:w-5 bg-purple-500/60 rounded-t-sm hover:bg-purple-500 transition-all relative group-hover:shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                            style={{ height: `${(trend.notes / maxTrendValue) * 100}%` }}
                                        >
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-black/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 text-white">
                                                {trend.notes} notes
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] sm:text-xs text-gray-400 font-medium">{trend.day}</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <div className="space-y-4 sm:space-y-6">
                        {/* Top Creators */}
                        <Card variant="glass" className="p-4 sm:p-6">
                            <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 mb-4 text-white">
                                <Trophy size={18} className="text-yellow-400" />
                                Top Creators
                            </h3>
                            <div className="space-y-3">
                                {stats?.topCreators?.length === 0 ? (
                                    <p className="text-sm text-gray-500">No creator data available</p>
                                ) : stats?.topCreators?.map((creator, i) => (
                                    <div key={creator.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs
                                            ${i === 0 ? 'bg-yellow-500 text-black' :
                                                i === 1 ? 'bg-gray-300 text-black' :
                                                    i === 2 ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400'}`}>
                                            #{i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-white truncate">{creator.name}</div>
                                            <div className="text-xs text-gray-400">{creator.count} notes created</div>
                                        </div>
                                        {i === 0 && <Trophy size={14} className="text-yellow-500" />}
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* System Load */}
                        <Card variant="glass" className="p-4 sm:p-6">
                            <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 mb-4 text-white">
                                <ActivityIcon size={18} className="text-green-400" />
                                System Load
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                                        <span className="text-gray-400 flex items-center gap-1.5"><Cpu size={14} /> CPU Utilization</span>
                                        <span className="font-mono font-bold text-white">{stats?.systemLoad?.cpu}%</span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${(stats?.systemLoad?.cpu || 0) > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                            style={{ width: `${stats?.systemLoad?.cpu}%` }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                                        <span className="text-gray-400 flex items-center gap-1.5"><Database size={14} /> Memory Usage</span>
                                        <span className="font-mono font-bold text-white">{stats?.systemLoad?.memory}%</span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${(stats?.systemLoad?.memory || 0) > 80 ? 'bg-red-500' : 'bg-purple-500'}`}
                                            style={{ width: `${stats?.systemLoad?.memory}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>

                <div className="dashboard-sections mb-6">
                    <section className="recent-activity">
                        <h3 className="text-base font-bold text-gray-200 mb-3">Quick Actions</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <Link to="/admin/support-center" className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 flex items-center gap-3 text-sm font-semibold text-gray-200 hover:text-white hover:border-indigo-500/40 transition-colors min-h-[48px]">
                                <ShieldAlert size={20} className="text-indigo-400 shrink-0" />
                                <span>Enterprise Support Center</span>
                            </Link>
                            <Link to="/admin/chats" className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 flex items-center gap-3 text-sm font-semibold text-gray-200 hover:text-white hover:border-indigo-500/40 transition-colors min-h-[48px] justify-between">
                                <div className="flex items-center gap-3">
                                    <MessageSquare size={20} className="text-indigo-400 shrink-0" />
                                    <span>Support Chats</span>
                                </div>
                                {(stats?.openChats || 0) > 0 && (
                                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{stats?.openChats}</span>
                                )}
                            </Link>
                            <Link to="/admin/kyc-compliance" className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 flex items-center gap-3 text-sm font-semibold text-gray-200 hover:text-white hover:border-purple-500/40 transition-colors min-h-[48px]">
                                <ShieldCheck size={20} className="text-purple-400 shrink-0" />
                                <span>KYC & Verification Queue</span>
                            </Link>
                            <Link to="/admin/users" className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 flex items-center gap-3 text-sm font-semibold text-gray-200 hover:text-white hover:border-indigo-500/40 transition-colors min-h-[48px]">
                                <Users size={20} className="text-indigo-400 shrink-0" />
                                <span>Manage Users</span>
                            </Link>
                            <Link to="/admin/deposits" className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 flex items-center gap-3 text-sm font-semibold text-gray-200 hover:text-white hover:border-indigo-500/40 transition-colors min-h-[48px]">
                                <CheckCircle size={20} className="text-indigo-400 shrink-0" />
                                <span>Manual Deposits</span>
                            </Link>
                        </div>
                    </section>
                </div>
            </div>
        </PullToRefresh>
    );
};

export default AdminDashboard;
