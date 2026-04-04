import { useEffect, useState, useMemo } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Plus, FileText, Star, Activity, Sparkles, TrendingUp, Zap, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotes } from '../../context/NotesContext';
import { useWallet } from '../../hooks/useWallet';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DashboardContext {
    openCreateNoteModal: () => void;
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export const DashboardHome = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { openCreateNoteModal } = useOutletContext<DashboardContext>();
    const { notes, stats } = useNotes();
    const { transactions } = useWallet();
    const [greeting, setGreeting] = useState('');
    
    // Combined Activity Feed Logic
    const recentNotes = useMemo(() => notes.slice(0, 5).map(n => ({
        id: n.id,
        type: 'NOTE',
        title: n.title || 'Untitled',
        date: new Date(n.updated_at || n.created_at),
        icon: <FileText size={16} />,
        color: 'text-emerald-400',
        content: n.content
    })), [notes]);

    const recentTxs = useMemo(() => transactions.slice(0, 5).map(t => ({
        id: t.id,
        type: 'TX',
        title: t.display_label || (t.type === 'DEPOSIT' ? 'Deposit' : 'Transfer'),
        date: new Date(t.created_at),
        icon: t.type === 'DEPOSIT' ? <TrendingUp size={16} /> : <Zap size={16} />,
        color: t.status === 'COMPLETED' ? 'text-emerald-400' : 'text-amber-400',
        amount: formatCurrency(t.amount, t.currency)
    })), [transactions]);

    const combinedActivity = useMemo(() => [...recentNotes, ...recentTxs]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 6), [recentNotes, recentTxs]);

    // Greeting logic
    useEffect(() => {
        const updateGreeting = () => {
            const hour = new Date().getHours();
            if (hour < 12) setGreeting('Good morning');
            else if (hour < 18) setGreeting('Good afternoon');
            else setGreeting('Good evening');
        };

        updateGreeting();
        const interval = setInterval(updateGreeting, 60000);
        return () => clearInterval(interval);
    }, []);

    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

    // Chart Data Generation (Trends)
    const chartData = useMemo(() => {
        const labels = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toLocaleDateString(undefined, { weekday: 'short' });
        });

        // Simple mock trend based on current counts to make it look "live"
        const data = [12, 19, 15, 25, (stats.totalBy || 10) + 5, (stats.totalBy || 10) + 12, (stats.totalBy || 10) + 20];

        return {
            labels,
            datasets: [{
                label: 'Activity',
                data,
                fill: true,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 2,
            }]
        };
    }, [stats.totalBy]);

    const chartOptions = {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
            x: { display: false },
            y: { display: false }
        },
        maintainAspectRatio: false,
    };

    return (
        <motion.div 
            className="pb-12 space-y-8"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* ── Immersive Hero Section ────────────────────────────── */}
            <motion.div variants={itemVariants} className="relative overflow-hidden p-8 md:p-12 rounded-[2.5rem] bg-[#0a0a0a] border border-white/5 shadow-2xl">
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                            <Sparkles size={14} />
                            Workspace Insight
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-4 tracking-tight">
                                {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-400 to-teal-500">{userName}</span>
                            </h1>
                            <p className="text-gray-400 text-lg max-w-xl leading-relaxed">
                                You have <span className="text-white font-bold">{stats.totalBy || 0} productive notes</span> and everything is synchronized perfectly. What are we building today?
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <Button onClick={openCreateNoteModal} className="h-14 px-8 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all">
                            <Plus className="w-5 h-5 mr-2" />
                            Launch New Note
                        </Button>
                    </div>
                </div>
            </motion.div>

            {/* ── Bento Grid Layout ────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[240px]">
                
                {/* Trends Card (Wide) */}
                <motion.div variants={itemVariants} className="md:col-span-8 overflow-hidden h-full">
                    <Card variant="glass-premium" className="p-8 flex flex-col h-full group hover:border-emerald-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Activity size={20} className="text-primary" />
                                    Workspace Momentum
                                </h3>
                                <p className="text-gray-500 text-sm">Activity trend across your modules</p>
                            </div>
                            <div className="text-right">
                                <span className="text-primary font-bold text-lg">+24%</span>
                                <p className="text-[10px] text-gray-500 uppercase font-black">Velocity</p>
                            </div>
                        </div>
                        <div className="flex-1 mt-4 -mx-2">
                           <Line data={chartData} options={chartOptions} />
                        </div>
                    </Card>
                </motion.div>

                {/* Performance Snapshot (Small) */}
                <motion.div variants={itemVariants} className="md:col-span-4 h-full">
                    <Card variant="glass-premium" className="p-8 h-full flex flex-col justify-between group hover:border-blue-500/30 transition-colors">
                        <div className="p-4 bg-blue-500/10 rounded-2xl w-fit text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                            <Zap size={24} />
                        </div>
                        <div>
                            <p className="text-gray-500 text-sm font-semibold uppercase tracking-widest mb-1">Favorites Intensity</p>
                            <h3 className="text-4xl font-black">{stats.favorites || 0}</h3>
                            <div className="w-full h-1 bg-white/5 rounded-full mt-4 overflow-hidden">
                                <div 
                                    className="h-full bg-blue-500 transition-all duration-1000" 
                                    style={{ width: `${Math.min(((stats.favorites || 0) / (stats.totalBy || 1)) * 100, 100)}%` }} 
                                />
                            </div>
                        </div>
                    </Card>
                </motion.div>

                {/* Live Activity Feed (Big) */}
                <motion.div variants={itemVariants} className="md:col-span-5 h-full auto-rows-fr">
                    <Card variant="glass-premium" className="p-0 flex flex-col h-[504px] sticky top-0 overflow-hidden group">
                        <div className="p-8 pb-4 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-xl font-bold flex items-center gap-2 italic">
                                <Activity size={20} className="text-primary" />
                                Live Pulse
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/wallet')} className="text-xs text-gray-500">History</Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                            <div className="space-y-1 p-2">
                                {combinedActivity.map((act) => (
                                    <div 
                                        key={act.id} 
                                        className="flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition-all group/item cursor-pointer"
                                        onClick={() => navigate(act.type === 'NOTE' ? '/dashboard/notes' : '/dashboard/activity')}
                                    >
                                        <div className={`p-2.5 rounded-xl bg-black border border-white/10 ${act.color} group-hover/item:scale-110 transition-transform`}>
                                            {act.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center">
                                                <p className="text-sm font-bold truncate group-hover/item:text-primary transition-colors">{act.title}</p>
                                                {act.type === 'TX' && (act as any).amount && <span className="text-xs font-black text-white">{(act as any).amount}</span>}
                                            </div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                                {act.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {act.type}
                                            </p>
                                        </div>
                                        <ChevronRight size={14} className="text-gray-700 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                    </div>
                                ))}
                                {combinedActivity.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">Silence in the workspace...</div>}
                            </div>
                        </div>
                    </Card>
                </motion.div>

                {/* Recent Items / Grid Bento Continued */}
                <motion.div variants={itemVariants} className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <Card variant="glass-premium" className="p-8 flex flex-col justify-between group h-[240px]" hoverEffect onClick={() => navigate('/dashboard/notes')}>
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                                <FileText size={20} />
                            </div>
                            <Star size={20} className="text-gray-700 hover:text-yellow-500 transition-colors" />
                        </div>
                        <div>
                            <h4 className="text-xl font-bold mb-1">Open Workspace</h4>
                            <p className="text-gray-500 text-xs">Jump back into your last {notes.length} notes instantly.</p>
                        </div>
                    </Card>

                    <Card variant="glass-premium" className="p-8 flex flex-col justify-between group h-[240px]" hoverEffect onClick={() => navigate('/dashboard/chat')}>
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400 group-hover:bg-blue-500 group-hover:text-black transition-all">
                                <Activity size={20} />
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xl font-bold mb-1">Secure Chats</h4>
                            <p className="text-gray-500 text-xs">Zero-trust messaging with your team and clients.</p>
                        </div>
                    </Card>

                    {/* Quick Preview of a Random Note */}
                    <motion.div className="sm:col-span-2" variants={itemVariants}>
                         <Card variant="glass-premium" className="p-8 hover:border-primary/20 transition-all cursor-pointer h-[130px] flex items-center justify-between" onClick={() => navigate('/dashboard/notes')}>
                           <div className="flex items-center gap-6">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shadow-lg shadow-primary/20">
                                    <Sparkles className="text-black" size={24} />
                                </div>
                                <div>
                                    <p className="text-white font-bold text-lg">Did You Know?</p>
                                    <p className="text-gray-400 text-sm italic">"Organization is the mother of performance." — Keep it up!</p>
                                </div>
                           </div>
                           <ChevronRight className="text-gray-500" />
                         </Card>
                    </motion.div>
                </motion.div>
            </div>
        </motion.div>
    );
};
