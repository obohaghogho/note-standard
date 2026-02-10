import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Users,
    Activity,
    FileText,
    MessageSquare,
    Calendar,
    ArrowUpRight,
    Loader2
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import './Analytics.css';

interface DetailedStats {
    totalUsers: number;
    activeUsers: number;
    totalNotes: number;
    openChats: number;
    onlineUsers: number;
    growthRate?: string;
    noteGrowth?: string;
    chatRetention?: string;
    usageTrends?: { day: string; notes: number; users: number }[];
    topCreators?: { id: string; name: string; count: number }[];
    systemLoad?: { cpu: number; memory: number };
}

export const Analytics = () => {
    const { session } = useAuth();
    const [stats, setStats] = useState<DetailedStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('7d');

    useEffect(() => {
        fetchDetailedStats();
    }, [session, timeframe]);

    const fetchDetailedStats = async () => {
        if (!session?.access_token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/admin/stats?timeframe=${timeframe}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await res.json();

            // Use real data from API (no mocks)
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="analytics-page loading">
                <Loader2 className="spinner" />
                <p>Calculating insights...</p>
            </div>
        );
    }

    // Calc max for chart scaling
    const maxTrendValue = stats?.usageTrends
        ? Math.max(...stats.usageTrends.map(d => Math.max(d.notes, d.users)), 10)
        : 10;

    return (
        <div className="analytics-page">
            <div className="analytics-header">
                <div className="header-info">
                    <h2>Advanced Analytics</h2>
                    <p>Real-time system usage and growth metrics</p>
                </div>
                <div className="timeframe-selector">
                    <Calendar size={18} />
                    <select 
                        id="analytics-timeframe" 
                        name="timeframe"
                        value={timeframe} 
                        onChange={(e) => setTimeframe(e.target.value)}
                    >
                        <option value="7d">Last 7 Days</option>
                        {/* Future: Add backend support for other ranges */}
                    </select>
                </div>
            </div>

            <div className="analytics-grid">
                {/* Main KPIs */}
                <div className="analytics-card kpi">
                    <div className="kpi-icon users">
                        <Users size={24} />
                    </div>
                    <div className="kpi-data">
                        <span className="kpi-label">User Growth</span>
                        <h3 className="kpi-value">{stats?.totalUsers}</h3>
                        <span className="trend positive">
                            <ArrowUpRight size={16} />
                            {stats?.growthRate || '0%'}
                        </span>
                    </div>
                </div>

                <div className="analytics-card kpi">
                    <div className="kpi-icon activity">
                        <Activity size={24} />
                    </div>
                    <div className="kpi-data">
                        <span className="kpi-label">Active Engagement</span>
                        <h3 className="kpi-value">{stats?.activeUsers}</h3>
                        <span className="trend positive">
                            {/* Just an activity metric for now */}
                            Live
                        </span>
                    </div>
                </div>

                <div className="analytics-card kpi">
                    <div className="kpi-icon notes">
                        <FileText size={24} />
                    </div>
                    <div className="kpi-data">
                        <span className="kpi-label">Content Created</span>
                        <h3 className="kpi-value">{stats?.totalNotes}</h3>
                        <span className="trend positive">
                            <ArrowUpRight size={16} />
                            {stats?.noteGrowth || '0%'}
                        </span>
                    </div>
                </div>

                <div className="analytics-card kpi">
                    <div className="kpi-icon chats">
                        <MessageSquare size={24} />
                    </div>
                    <div className="kpi-data">
                        <span className="kpi-label">Resolution Rate</span>
                        <h3 className="kpi-value">{stats?.chatRetention || '0%'}</h3>
                        <span className="trend neutral">
                            Efficiency
                        </span>
                    </div>
                </div>
            </div>

            <div className="detailed-analytics">
                <div className="analytics-chart-placeholder" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="chart-header">
                        <h4>Usage Trends</h4>
                        <div className="chart-legend">
                            <span className="legend-item"><span className="dot users" /> Users</span>
                            <span className="legend-item"><span className="dot notes" /> Notes</span>
                        </div>
                    </div>

                    <div className="flex-1 flex items-end justify-between gap-4 h-64 px-2 pb-2">
                        {stats?.usageTrends?.map((trend, i) => (
                            <div key={i} className="flex flex-col items-center gap-2 w-full h-full justify-end group relative">
                                <div className="w-full flex gap-1 items-end justify-center h-full">
                                    {/* Users Bar */}
                                    <div
                                        className="w-3 md:w-6 bg-blue-500/50 rounded-t-sm hover:bg-blue-500 transition-all relative"
                                        style={{ height: `${(trend.users / maxTrendValue) * 100}%` }}
                                        title={`${trend.users} users`}
                                    />
                                    {/* Notes Bar */}
                                    <div
                                        className="w-3 md:w-6 bg-purple-500/50 rounded-t-sm hover:bg-purple-500 transition-all relative"
                                        style={{ height: `${(trend.notes / maxTrendValue) * 100}%` }}
                                        title={`${trend.notes} notes`}
                                    />
                                </div>
                                <span className="text-xs text-gray-400 font-medium">{trend.day}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="secondary-stats">
                    <div className="analytics-card mini">
                        <h4>Top Creators</h4>
                        <div className="mini-list">
                            {stats?.topCreators?.length ? (
                                stats.topCreators.map((creator, i) => (
                                    <div key={creator.id} className="mini-item">
                                        <span>#{i + 1} {creator.name}</span>
                                        <strong>{creator.count} notes</strong>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 p-2">No creators data</p>
                            )}
                        </div>
                    </div>

                    <div className="analytics-card mini">
                        <h4>System Load</h4>
                        <div className="space-y-4 pt-2">
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span>CPU</span>
                                    <span>{stats?.systemLoad?.cpu || 0}%</span>
                                </div>
                                <div className="load-meter">
                                    <div
                                        className="meter-fill"
                                        style={{ width: `${stats?.systemLoad?.cpu || 0}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span>Memory</span>
                                    <span>{stats?.systemLoad?.memory || 0}%</span>
                                </div>
                                <div className="load-meter">
                                    <div
                                        className="meter-fill"
                                        style={{ width: `${stats?.systemLoad?.memory || 0}%`, background: '#a855f7' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
