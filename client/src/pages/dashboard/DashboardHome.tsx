import { useEffect, useState, useRef } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Clock, Plus, FileText, Star } from 'lucide-react';
import { supabase, safeDashboardStats } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useOutletContext } from 'react-router-dom';

import type { Note } from '../../types/note';

interface DashboardContext {
    openCreateNoteModal: () => void;
}

export const DashboardHome = () => {
    const { user, authReady } = useAuth();
    const navigate = useNavigate();
    const { openCreateNoteModal } = useOutletContext<DashboardContext>();
    const [stats, setStats] = useState({ totalBy: 0, favorites: 0 });
    const [recentNotes, setRecentNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);

    const isMounted = useRef(true);
    const fetchLock = useRef(false);

    const fetchData = async () => {
        if (!user || !authReady || fetchLock.current) return;
        
        fetchLock.current = true;
        try {
            console.log('[Dashboard] Fetching stats for user:', user.id);
            const results = await safeDashboardStats(user.id);

            if (isMounted.current && results) {
                setStats(results.stats);
                setRecentNotes(results.recentNotes);
                setLoading(false);
            }
        } finally {
            fetchLock.current = false;
        }
    };

    useEffect(() => {
        isMounted.current = true;
        
        if (authReady) {
            if (user) {
                setLoading(true);
                fetchData();
            } else {
                setLoading(false);
            }
        }

        // Realtime Subscription
        let channel: any = null;
        
        if (user && authReady) {
            channel = supabase.channel(`dashboard_home:${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'notes',
                        filter: `owner_id=eq.${user.id}`
                    },
                    () => {
                        // Refresh stats on any change to user's notes
                        fetchData();
                    }
                )
                .subscribe();
        }

        return () => {
            isMounted.current = false;
            if (channel) supabase.removeChannel(channel);
        };
    }, [user, authReady]);

    const [greeting, setGreeting] = useState('');

    useEffect(() => {
        const updateGreeting = () => {
            const hour = new Date().getHours();
            if (hour < 12) setGreeting('Good morning');
            else if (hour < 18) setGreeting('Good afternoon');
            else setGreeting('Good evening');
        };

        updateGreeting();
        const interval = setInterval(updateGreeting, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

    // Calculate Recent Activity
    const getLastActivity = () => {
        if (loading) return '-';
        if (recentNotes.length === 0 || !recentNotes[0]) return 'No activity';
        
        const lastDate = new Date(recentNotes[0].updated_at || recentNotes[0].created_at || new Date());
        if (isNaN(lastDate.getTime())) return 'No activity';

        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - lastDate.getTime()) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return lastDate.toLocaleDateString();
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold mb-1 truncate max-w-full" title={`${greeting}, ${userName}`}>
                        {greeting}, {userName}
                    </h1>
                    <p className="text-gray-400">Here's what's happening in your workspace today.</p>
                </div>
                <Button onClick={openCreateNoteModal}>
                    <Plus className="w-4 h-4" />
                    New Note
                </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="glass" className="p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-gray-400 text-sm font-medium mb-1">Total Notes</p>
                            <h3 className="text-2xl font-bold">{loading ? '-' : stats.totalBy}</h3>
                        </div>
                        <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
                            <FileText size={20} />
                        </div>
                    </div>
                </Card>
                <Card variant="glass" className="p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-gray-400 text-sm font-medium mb-1">Favorites</p>
                            <h3 className="text-2xl font-bold">{loading ? '-' : stats.favorites}</h3>
                        </div>
                        <div className="p-3 bg-yellow-500/10 rounded-lg text-yellow-400">
                            <Star size={20} />
                        </div>
                    </div>
                </Card>
                <Card variant="glass" className="p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-gray-400 text-sm font-medium mb-1">Recent Activity</p>
                            <h3 className="text-2xl font-bold">{getLastActivity()}</h3>
                        </div>
                        <div className="p-3 bg-green-500/10 rounded-lg text-green-400">
                            <Clock size={20} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Recent Notes */}
            <div>
                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                    <h2 className="text-xl font-bold">Recent Notes</h2>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/notes')}>View All</Button>
                </div>

                {loading ? (
                    <div className="text-gray-400">Loading notes...</div>
                ) : recentNotes.length === 0 ? (
                    <div className="text-gray-400">No notes yet. Create one to get started!</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {recentNotes?.map((note) => (
                            <Card key={note.id} hoverEffect className="p-6 cursor-pointer group">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-2 bg-white/5 rounded-lg group-hover:bg-primary/20 transition-colors">
                                        <FileText size={18} className="text-gray-400 group-hover:text-primary transition-colors" />
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {new Date(note.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                                    {note.title || 'Untitled Note'}
                                </h3>
                                <p className="text-gray-400 text-sm line-clamp-3">
                                    {note.content || 'No content...'}
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {note.tags?.map(tag => (
                                        <span key={tag} className="text-xs px-2 py-1 bg-white/5 rounded-md text-gray-400">{tag}</span>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
