import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Loader2, TrendingUp, Users, FileText, Lock, Radio, Sparkles, BookOpen, UserPlus, ShieldAlert } from 'lucide-react';
import { API_URL } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
import { UniversalPostCard } from '../../components/community/UniversalPostCard';
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
    const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'briefing' | 'discover'>('overview');
    const { socket, connected } = useSocket();

    // Tab Data States
    const [trendingPosts, setTrendingPosts] = useState<any[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [briefing, setBriefing] = useState('');
    const [loadingBriefing, setLoadingBriefing] = useState(false);
    const [creators, setCreators] = useState<any[]>([]);
    const [spaces, setSpaces] = useState<any[]>([]);
    const [loadingDiscover, setLoadingDiscover] = useState(false);
    const [followingState, setFollowingState] = useState<Record<string, boolean>>({});
    const [joiningState, setJoiningState] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        if (!socket) return;

        socket.on('stats_updated', (realtimeStats: DailyStats) => {
            console.log('[Trends] Real-time stats received:', realtimeStats);
            setStats(prev => {
                const today = realtimeStats.date;
                const existingToday = prev.find(s => s.date === today);
                if (existingToday) {
                    return prev.map(s => s.date === today ? realtimeStats : s);
                } else {
                    return [...prev, realtimeStats].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                }
            });
        });

        return () => {
            socket.off('stats_updated');
        };
    }, [socket]);

    useEffect(() => {
        if (activeTab === 'feed') {
            fetchTrendingPosts();
        } else if (activeTab === 'briefing') {
            fetchBriefing();
        } else if (activeTab === 'discover') {
            fetchDiscover();
        }
    }, [activeTab]);

    const fetchStats = async () => {
        try {
            const response = await fetch(`${API_URL}/api/analytics`);
            if (!response.ok) {
                console.error('Analytics API returned', response.status);
                return;
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                setStats(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            }
        } catch (error) {
            console.error('Error fetching trends stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTrendingPosts = async () => {
        try {
            setLoadingPosts(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/community/feed?tab=trending`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setTrendingPosts(data.posts || []);
            }
        } catch (error) {
            console.error('Error fetching trending posts:', error);
        } finally {
            setLoadingPosts(false);
        }
    };

    const fetchBriefing = async () => {
        try {
            setLoadingBriefing(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/notes-ai/trends-briefing`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setBriefing(data.briefing || '');
            }
        } catch (error) {
            console.error('Error fetching trends briefing:', error);
        } finally {
            setLoadingBriefing(false);
        }
    };

    const fetchDiscover = async () => {
        try {
            setLoadingDiscover(true);
            const token = localStorage.getItem('token');
            const [creatorsRes, spacesRes] = await Promise.all([
                fetch(`${API_URL}/api/community/suggested-creators?limit=6`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_URL}/api/community/spaces`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (creatorsRes.ok) {
                const data = await creatorsRes.json();
                setCreators(data || []);
                const followState: Record<string, boolean> = {};
                data.forEach((c: any) => { followState[c.id] = c.is_following || false; });
                setFollowingState(followState);
            }
            if (spacesRes.ok) {
                const data = await spacesRes.json();
                setSpaces(data || []);
            }
        } catch (error) {
            console.error('Error fetching discover data:', error);
        } finally {
            setLoadingDiscover(false);
        }
    };

    const handleFollow = async (creatorId: string) => {
        const was = followingState[creatorId];
        setFollowingState(prev => ({ ...prev, [creatorId]: !was }));
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_URL}/api/community/profile/${creatorId}/follow`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch {
            setFollowingState(prev => ({ ...prev, [creatorId]: was }));
        }
    };

    const handleJoinSpace = async (spaceId: string) => {
        setJoiningState(prev => ({ ...prev, [spaceId]: true }));
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/community/spaces/${spaceId}/join`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSpaces(prev => prev.map(s => s.id === spaceId ? { ...s, member_count: (s.member_count || 0) + 1, is_member: true } : s));
            }
        } catch (error) {
            console.error('Failed to join space:', error);
        } finally {
            setJoiningState(prev => ({ ...prev, [spaceId]: false }));
        }
    };

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>;
    }

    // Chart Data calculations
    const labels = stats?.map(s => new Date(s.date).toLocaleDateString());

    const noteData = {
        labels,
        datasets: [
            {
                label: 'Global Notes Created (Anonymized)',
                data: stats?.map(s => s.total_notes_created),
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
                data: stats?.map(s => s.total_active_users),
                borderColor: 'rgb(168, 85, 247)',
                backgroundColor: 'rgba(168, 85, 247, 0.5)',
                tension: 0.4
            }
        ]
    };

    // Aggregate tags
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
        labels: sortedTags?.map(([tag]) => tag),
        datasets: [
            {
                label: 'Trending Topics',
                data: sortedTags?.map(([, count]) => count),
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
            {/* Header banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                        <TrendingUp className="text-primary" />
                        Community Trends
                    </h1>
                    <p className="text-gray-400 mt-1">Real-time intelligence from the Note Standard community.</p>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                    {connected && (
                        <div className="flex items-center gap-1.5 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md animate-pulse border border-red-500/20">
                            <Radio size={12} />
                            LIVE
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 px-3 py-1.5 rounded-full border border-green-900/50">
                        <Lock size={12} />
                        Privacy-Safe Data
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-4 border-b border-white/5 overflow-x-auto no-scrollbar pb-px scroll-smooth">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'overview' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><FileText size={18} /> Analytics Overview</span>
                    {activeTab === 'overview' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('feed')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'feed' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><BookOpen size={18} /> Trending Feed</span>
                    {activeTab === 'feed' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('briefing')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'briefing' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><Sparkles size={18} /> AI Daily Briefing</span>
                    {activeTab === 'briefing' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('discover')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'discover' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><Users size={18} /> Discover Suggested</span>
                    {activeTab === 'discover' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
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
                                        plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } },
                                        scales: {
                                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                                            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
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
                                        plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } },
                                        scales: {
                                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                                            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
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
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                                        x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                                    }
                                }}
                            />
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'feed' && (
                <div className="space-y-6 max-w-3xl mx-auto">
                    {loadingPosts ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : trendingPosts.length === 0 ? (
                        <Card variant="glass" className="p-12 text-center text-gray-500">
                            No trending posts found in the community yet. Check back later!
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            {trendingPosts.map(post => (
                                <UniversalPostCard key={post.id} post={post} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'briefing' && (
                <div className="max-w-4xl mx-auto">
                    {loadingBriefing ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : (
                        <Card variant="glass" className="p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-white/5 to-white/[0.02]">
                            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                AI SYNCED
                            </div>
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                                <Sparkles className="text-primary" size={20} />
                                Community Intelligence Briefing
                            </h3>
                            <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed text-gray-300 whitespace-pre-wrap font-sans bg-black/20 p-6 rounded-xl border border-white/5 shadow-inner">
                                {briefing || "The AI is currently analyzing note tags and community posts. Please check back shortly!"}
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {activeTab === 'discover' && (
                <div className="space-y-8">
                    {loadingDiscover ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Suggested Creators */}
                            <Card variant="glass" className="p-6">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <Users className="text-purple-400" size={18} />
                                    Suggested Creators
                                </h3>
                                {creators.length === 0 ? (
                                    <p className="text-sm text-gray-500 py-4 text-center">No creators to recommend.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {creators.map(creator => (
                                            <div key={creator.id} className="flex items-center justify-between gap-4 p-2 hover:bg-white/5 rounded-xl transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={creator.avatar_url || `https://ui-avatars.com/api/?name=${creator.username}&background=6366f1&color=fff`}
                                                        alt={creator.username}
                                                        className="w-10 h-10 rounded-full object-cover shrink-0"
                                                    />
                                                    <div>
                                                        <div className="font-semibold text-sm text-white">{creator.username}</div>
                                                        <div className="text-xs text-gray-400">{(creator.followers_count || 0).toLocaleString()} followers</div>
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={() => handleFollow(creator.id)}
                                                    variant={followingState[creator.id] ? 'secondary' : 'primary'}
                                                    className="px-3 py-1 text-xs h-8"
                                                >
                                                    {followingState[creator.id] ? 'Following' : 'Follow'}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>

                            {/* Suggested Communities/Spaces */}
                            <Card variant="glass" className="p-6">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <TrendingUp className="text-blue-400" size={18} />
                                    Trending Spaces
                                </h3>
                                {spaces.length === 0 ? (
                                    <p className="text-sm text-gray-500 py-4 text-center">No spaces currently trending.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {spaces.map(space => (
                                            <div key={space.id} className="flex items-center justify-between gap-4 p-2 hover:bg-white/5 rounded-xl transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                                                        {space.avatar_url
                                                            ? <img src={space.avatar_url} alt={space.name} className="w-full h-full object-cover" />
                                                            : space.name[0]?.toUpperCase()
                                                        }
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-sm text-white">{space.name}</div>
                                                        <div className="text-xs text-gray-400">{(space.member_count || 0).toLocaleString()} members</div>
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={() => handleJoinSpace(space.id)}
                                                    disabled={space.is_member || joiningState[space.id]}
                                                    variant="secondary"
                                                    className="px-3 py-1 text-xs h-8"
                                                >
                                                    {space.is_member ? 'Member' : 'Join'}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* Privacy note */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400">
                    Want to contribute to these stats? Go to <a href="/dashboard/settings?tab=privacy" className="text-primary hover:underline">Settings &gt; Privacy</a> and opt-in to Anonymous Analytics.
                </p>
            </div>
        </div>
    );
};

export default Trends;
