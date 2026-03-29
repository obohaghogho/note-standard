import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Clock, Plus, FileText, Star, ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotes } from '../../context/NotesContext';
import { useWallet } from '../../hooks/useWallet';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { formatCurrency } from '../../lib/CurrencyFormatter';

interface DashboardContext {
    openCreateNoteModal: () => void;
}

export const DashboardHome = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { openCreateNoteModal } = useOutletContext<DashboardContext>();
    const { notes, stats, loading: notesLoading } = useNotes();
    const { transactions, loading: walletLoading } = useWallet();
    const [greeting, setGreeting] = useState('');
    
    // Combined Activity Feed Logic
    const recentNotes = notes.slice(0, 5).map(n => ({
        id: n.id,
        type: 'NOTE',
        title: n.title || 'New Note',
        date: new Date(n.updated_at || n.created_at),
        icon: <FileText size={16} />,
        color: 'text-blue-400',
        content: n.content
    }));

    const recentTxs = transactions.slice(0, 5).map(t => ({
        id: t.id,
        type: 'TX',
        title: t.display_label || (t.type === 'DEPOSIT' ? 'Deposit' : 'Transfer'),
        date: new Date(t.created_at),
        icon: t.type === 'DEPOSIT' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />,
        color: t.status === 'COMPLETED' ? 'text-green-400' : 'text-amber-400',
        amount: formatCurrency(t.amount, t.currency)
    }));

    const combinedActivity = [...recentNotes, ...recentTxs]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5);

    const loading = notesLoading || walletLoading;

    // Greeting logic
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

    // Calculate Recent Activity (Now uses combined multi-module feed)
    const getLastActivity = () => {
        if (loading) return '-';
        if (combinedActivity.length === 0 || !combinedActivity[0]) return 'No activity';
        
        const lastDate = combinedActivity[0].date;
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

            {/* Live Activity Feed & Recent Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Unified Activity Timeline */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Activity size={20} className="text-primary" />
                            Live Activity
                        </h2>
                    </div>
                    
                    <Card variant="glass" className="p-4 space-y-4">
                        {loading ? (
                            <div className="text-gray-500 text-sm animate-pulse">Syncing platform activity...</div>
                        ) : combinedActivity.length === 0 ? (
                            <div className="text-gray-400 text-sm py-4">No recent activity detected.</div>
                        ) : (
                            combinedActivity.map((act) => (
                                <div key={act.id} className="flex items-start gap-4 group cursor-pointer" onClick={() => navigate(act.type === 'NOTE' ? '/dashboard/notes' : '/dashboard/wallet/transactions')}>
                                    <div className={`p-2 rounded-lg bg-white/5 ${act.color} group-hover:scale-110 transition-transform`}>
                                        {act.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{act.title}</p>
                                            {act.type === 'TX' && (act as any).amount && <span className="text-xs font-bold text-white ml-2">{(act as any).amount}</span>}
                                        </div>
                                        <p className="text-[10px] text-gray-500">
                                            {act.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {act.type === 'NOTE' ? 'Workspace' : 'Finance'}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                        <Button 
                            variant="ghost" 
                            fullWidth 
                            size="sm" 
                            className="mt-2 text-xs text-gray-400 hover:text-white border-t border-white/5 pt-3 rounded-none"
                            onClick={() => navigate('/dashboard/wallet/transactions')}
                        >
                            View All Transactions
                        </Button>
                    </Card>
                </div>

                {/* Recent Workspace Notes */}
                <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold">Recent Notes</h2>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/notes')}>View All</Button>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[1, 2].map(i => <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse" />)}
                        </div>
                    ) : notes.length === 0 ? (
                        <div className="text-gray-400 bg-white/5 p-8 rounded-2xl text-center">No notes yet. Create one to get started!</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {notes.slice(0, 4).map((note) => (
                                <Card 
                                    key={note.id} 
                                    hoverEffect 
                                    className="p-5 cursor-pointer group"
                                    onClick={() => navigate('/dashboard/notes')}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="p-2 bg-white/5 rounded-lg group-hover:bg-primary/20 transition-colors">
                                            <FileText size={16} className="text-gray-400 group-hover:text-primary transition-colors" />
                                        </div>
                                        <span className="text-[10px] text-gray-500">
                                            {new Date(note.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-base mb-1 truncate group-hover:text-primary transition-colors">
                                        {note.title || 'Untitled Note'}
                                    </h3>
                                    <p className="text-gray-400 text-xs line-clamp-2">
                                        {note.content || 'No content...'}
                                    </p>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
