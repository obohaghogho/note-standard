import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Users,
    FileText,
    MessageSquare,
    TrendingUp,
    Activity,
    Server,
    Clock,
    AlertCircle,
    Cpu,
    Database,
    Trophy
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import { Card } from '../../components/common/Card';
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

    useEffect(() => {
        fetchStats();
        // Refresh stats every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, [session]);

    const fetchStats = async () => {
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/stats`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
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
    };

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
            <div className="admin-dashboard error">
                <AlertCircle size={48} />
                <p>{error}</p>
                <button onClick={fetchStats}>Retry</button>
            </div>
        );
    }

    const statCards = [
        {
            label: 'Total Users',
            value: stats?.totalUsers || 0,
            icon: Users,
            color: 'blue',
            trend: '+12%'
        },
        {
            label: 'Active Users (24h)',
            value: stats?.activeUsers || 0,
            icon: Activity,
            color: 'green',
            trend: '+5%'
        },
        {
            label: 'Total Notes',
            value: stats?.totalNotes || 0,
            icon: FileText,
            color: 'purple',
            trend: '+23%'
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
            icon: TrendingUp,
            color: 'cyan',
            live: true
        },
    ];

    // Find max value for charts scaling
    const maxTrendValue = stats?.usageTrends
        ? Math.max(...stats.usageTrends.map(d => Math.max(d.notes, d.users)), 10)
        : 10;

    return (
        <div className="admin-dashboard">
            <div className="dashboard-header">
                <h2>Dashboard Overview</h2>
                <div className="server-status">
                    <Server size={16} />
                    <span className={`status ${stats?.serverStatus === 'healthy' ? 'healthy' : 'issues'}`}>
                        Server: {stats?.serverStatus || 'Unknown'}
                    </span>
                </div>
            </div>

            <div className="stats-grid">
                {statCards.map((card, index) => (
                    <div key={index} className={`stat-card ${card.color}`}>
                        <div className="stat-icon">
                            <card.icon size={24} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-value">
                                {card.value.toLocaleString()}
                                {card.live && <span className="live-dot" />}
                            </span>
                            <span className="stat-label">{card.label}</span>
                        </div>
                        {card.trend && (
                            <span className="stat-trend positive">{card.trend}</span>
                        )}
                        {card.urgent && card.value > 0 && (
                            <span className="stat-urgent">Needs attention</span>
                        )}
                    </div>
                ))}
            </div>

            {/* New Data Sections: Usage Trends, Top Creators, System Load */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 mt-6">

                {/* Usage Trends Chart */}
                <Card variant="glass" className="lg:col-span-2 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <TrendingUp size={20} className="text-blue-400" />
                            Usage Trends (7 Days)
                        </h3>
                        <div className="flex gap-4 text-xs font-medium">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-blue-500" /> Users
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-purple-500" /> Notes
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex items-end justify-between gap-4 h-48 px-2">
                        {stats?.usageTrends?.map((trend, i) => (
                            <div key={i} className="flex flex-col items-center gap-2 w-full h-full justify-end group">
                                <div className="w-full flex gap-1 items-end justify-center h-full">
                                    {/* Users Bar */}
                                    <div
                                        className="w-3 md:w-6 bg-blue-500/50 rounded-t-sm hover:bg-blue-500 transition-all relative group-hover:shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                        style={{ height: `${(trend.users / maxTrendValue) * 100}%` }}
                                    >
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-black/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {trend.users} users
                                        </div>
                                    </div>
                                    {/* Notes Bar */}
                                    <div
                                        className="w-3 md:w-6 bg-purple-500/50 rounded-t-sm hover:bg-purple-500 transition-all relative group-hover:shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                        style={{ height: `${(trend.notes / maxTrendValue) * 100}%` }}
                                    >
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-black/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {trend.notes} notes
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-400 font-medium">{trend.day}</span>
                            </div>
                        ))}
                    </div>
                </Card>

                <div className="space-y-6">
                    {/* Top Creators */}
                    <Card variant="glass" className="p-6">
                        <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                            <Trophy size={18} className="text-yellow-400" />
                            Top Creators
                        </h3>
                        <div className="space-y-4">
                            {stats?.topCreators?.length === 0 ? (
                                <p className="text-sm text-gray-500">No data available</p>
                            ) : stats?.topCreators?.map((creator, i) => (
                                <div key={creator.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs
                                        ${i === 0 ? 'bg-yellow-500 text-black' :
                                            i === 1 ? 'bg-gray-300 text-black' :
                                                i === 2 ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400'}`}>
                                        #{i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{creator.name}</div>
                                        <div className="text-xs text-gray-500">{creator.count} notes created</div>
                                    </div>
                                    {i === 0 && <Trophy size={14} className="text-yellow-500" />}
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* System Load */}
                    <Card variant="glass" className="p-6">
                        <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                            <Activity size={18} className="text-green-400" />
                            System Load
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-400 flex items-center gap-2"><Cpu size={14} /> CPU Utilization</span>
                                    <span className="font-mono font-bold">{stats?.systemLoad?.cpu}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${(stats?.systemLoad?.cpu || 0) > 80 ? 'bg-red-500' : 'bg-blue-500'
                                            }`}
                                        style={{ width: `${stats?.systemLoad?.cpu}%` }}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-400 flex items-center gap-2"><Database size={14} /> Memory Usage</span>
                                    <span className="font-mono font-bold">{stats?.systemLoad?.memory}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${(stats?.systemLoad?.memory || 0) > 80 ? 'bg-red-500' : 'bg-purple-500'
                                            }`}
                                        style={{ width: `${stats?.systemLoad?.memory}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <div className="dashboard-sections">
                <section className="recent-activity">
                    <h3>Quick Actions</h3>
                    <div className="quick-actions">
                        <Link to="/admin/chats" className="action-card">
                            <MessageSquare />
                            <span>View Support Chats</span>
                            {(stats?.openChats || 0) > 0 && (
                                <span className="action-badge">{stats?.openChats}</span>
                            )}
                        </Link>
                        <Link to="/admin/users" className="action-card">
                            <Users />
                            <span>Manage Users</span>
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
};
