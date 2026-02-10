import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader2, TrendingUp, Users, FileText, Lock } from 'lucide-react';
import { API_URL } from '../../lib/api';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

interface DailyStats {
    date: string;
    total_active_users: number;
    total_notes_created: number;
    top_tags: Record<string, number>;
}

export const Trends = () => {
    const [stats, setStats] = useState<DailyStats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await fetch(`${API_URL}/api/analytics`);
            const data = await response.json();
            // Sort by date ascending for charts
            if (Array.isArray(data)) {
                setStats(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            }
        } catch (error) {
            console.error('Error fetching trends:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>;
    }

    // Prepare Chart Data
    const labels = stats.map(s => new Date(s.date).toLocaleDateString());

    const noteData = {
        labels,
        datasets: [
            {
                label: 'Global Notes Created (Anonymized)',
                data: stats.map(s => s.total_notes_created),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                tension: 0.4
            }
        ]
    };

    const activeUserData = {
        labels,
        datasets: [
            {
                label: 'Active Contributor Count',
                data: stats.map(s => s.total_active_users),
                borderColor: 'rgb(168, 85, 247)',
                backgroundColor: 'rgba(168, 85, 247, 0.5)',
                tension: 0.4
            }
        ]
    };

    // Aggregate tags from all days
    const allTags: Record<string, number> = {};
    stats.forEach(day => {
        if (day.top_tags) {
            Object.entries(day.top_tags).forEach(([tag, count]) => {
                allTags[tag] = (allTags[tag] || 0) + count;
            });
        }
    });

    const sortedTags = Object.entries(allTags)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    const tagData = {
        labels: sortedTags.map(([tag]) => tag),
        datasets: [
            {
                label: 'Trending Topics',
                data: sortedTags.map(([, count]) => count),
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 206, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                ],
            }
        ]
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <TrendingUp className="text-primary" />
                        Community Trends
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Anonymous insights from the Note Standard community.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 px-3 py-1.5 rounded-full border border-green-900/50">
                    <Lock size={12} />
                    Verified Privacy-Safe Data
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <Card variant="glass" className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-blue-400" />
                        Productivity Pulse
                    </h3>
                    <div className="h-64">
                        <Line
                            data={noteData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'bottom' }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        grid: { color: 'rgba(255,255,255,0.05)' }
                                    },
                                    x: {
                                        grid: { color: 'rgba(255,255,255,0.05)' }
                                    }
                                }
                            }}
                        />
                    </div>
                </Card>

                <Card variant="glass" className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Users size={18} className="text-purple-400" />
                        Active Contributors
                    </h3>
                    <div className="h-64">
                        <Line
                            data={activeUserData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'bottom' }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        grid: { color: 'rgba(255,255,255,0.05)' }
                                    },
                                    x: {
                                        grid: { color: 'rgba(255,255,255,0.05)' }
                                    }
                                }
                            }}
                        />
                    </div>
                </Card>
            </div>

            <Card variant="glass" className="p-6">
                <h3 className="text-lg font-semibold mb-4">Top Trending Topics</h3>
                <div className="h-80">
                    <Bar
                        data={tagData}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: { color: 'rgba(255,255,255,0.05)' }
                                },
                                x: {
                                    grid: { display: false }
                                }
                            }
                        }}
                    />
                </div>
            </Card>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400">
                    Want to contribute to these stats? Go to <a href="/dashboard/settings?tab=privacy" className="text-primary hover:underline">Settings &gt; Privacy</a> and opt-in to Anonymous Analytics.
                </p>
            </div>
        </div>
    );
};
