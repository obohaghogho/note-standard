import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Activity, 
  Wallet, 
  Brain, 
  TrendingUp, 
  Coins, 
  Search,
  Server,
  HeartPulse,
  DollarSign
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/api';

function getDistanceToNow(dateObj: Date): string {
    const diffInSeconds = Math.max(0, Math.floor((dateObj.getTime() - Date.now()) / 1000));
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ${diffInSeconds % 60}s`;
    return `${Math.floor(diffInMinutes / 60)}h ${diffInMinutes % 60}m`;
}

interface Proposal {
    id: string;
    wallet_id: string;
    wallets_store: { address: string };
    asset: string;
    currency: string;
    drift_amount: number;
    direction: number;
    status: 'AUDITING' | 'APPLIED' | 'INVALIDATED';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    settlement_epoch_id: number;
    eligible_at: string;
    expires_at: string;
    applied_at: string | null;
    created_at: string;
}

interface Connector {
    id: string;
    name: string;
    provider_type: string;
    status: string;
    is_sandbox: boolean;
    created_at: string;
}

interface AiInsights {
    spendingScore: number;
    forecast: string;
    suggestions: string[];
    riskLevel: string;
    smartCategoryHighlights: Record<string, string>;
}

export const ReconciliationDashboard: React.FC = () => {
    const { session } = useAuth();
    const [activeTab, setActiveTab] = useState<'reconciliation' | 'connectors' | 'ai-intelligence'>('reconciliation');
    
    // Reconciliation Observatory States
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loadingProposals, setLoadingProposals] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'AUDITING' | 'APPLIED' | 'INVALIDATED'>('ALL');
    const [now, setNow] = useState(new Date());

    // Connectors States
    const [connectors, setConnectors] = useState<Connector[]>([]);
    const [loadingConnectors, setLoadingConnectors] = useState(false);
    const [healthStatus, setHealthStatus] = useState<Record<string, { status: string; latencyMs?: number; checking?: boolean }>>({});
    const [balances, setBalances] = useState<Record<string, { balance?: number; currency?: string; querying?: boolean }>>({});

    // AI Intelligence States
    const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
    const [loadingAi, setLoadingAi] = useState(false);
    const [analyticsStats, setAnalyticsStats] = useState<any>(null);

    // 1. Fetch Reconciliation Proposals
    const fetchProposals = useCallback(async () => {
        if (!session?.access_token) return;
        setLoadingProposals(true);
        try {
            const statusQ = filter === 'ALL' ? '' : `?status=${filter}`;
            const response = await fetch(`${API_URL}/api/admin/reconciliation/proposals${statusQ}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data.success) {
                setProposals(data.proposals || []);
            }
        } catch {
            toast.error('Failed to fetch reconciliation proposals');
        } finally {
            setLoadingProposals(false);
        }
    }, [filter, session?.access_token]);

    // 2. Fetch Connectors Catalog
    const fetchConnectors = useCallback(async () => {
        if (!session?.access_token) return;
        setLoadingConnectors(true);
        try {
            const response = await fetch(`${API_URL}/api/nfi/connectors/list`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data.success) {
                setConnectors(data.connectors || []);
            }
        } catch (err) {
            toast.error('Failed to load connector catalog');
        } finally {
            setLoadingConnectors(false);
        }
    }, [session?.access_token]);

    // 3. Fetch AI Intelligence & Analytics
    const fetchAiIntelligence = useCallback(async () => {
        if (!session?.access_token) return;
        setLoadingAi(true);
        try {
            const resInsights = await fetch(`${API_URL}/api/nfi/financials/ai-insights`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const dataInsights = await resInsights.json();
            if (dataInsights.success) {
                setAiInsights(dataInsights.insights);
            }

            const resStats = await fetch(`${API_URL}/api/nfi/financials/analytics`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const dataStats = await resStats.json();
            if (dataStats.success) {
                setAnalyticsStats(dataStats.stats);
            }
        } catch {
            toast.error('Failed to load AI Intelligence insights');
        } finally {
            setLoadingAi(false);
        }
    }, [session?.access_token]);

    useEffect(() => {
        if (activeTab === 'reconciliation') {
            fetchProposals();
        } else if (activeTab === 'connectors') {
            fetchConnectors();
        } else if (activeTab === 'ai-intelligence') {
            fetchAiIntelligence();
        }
    }, [activeTab, fetchProposals, fetchConnectors, fetchAiIntelligence]);

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Interactive Health Check
    const checkHealth = async (name: string) => {
        if (!session?.access_token) return;
        setHealthStatus(prev => ({ ...prev, [name]: { status: 'Checking...', checking: true } }));
        try {
            const response = await fetch(`${API_URL}/api/nfi/connectors/${name}/health`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data.success) {
                setHealthStatus(prev => ({ 
                    ...prev, 
                    [name]: { status: data.status, latencyMs: data.latencyMs, checking: false } 
                }));
                toast.success(`${name.toUpperCase()} health check completed!`);
            }
        } catch {
            setHealthStatus(prev => ({ ...prev, [name]: { status: 'unhealthy', checking: false } }));
            toast.error(`Health check failed for ${name}`);
        }
    };

    // Balance Inquiry
    const queryBalance = async (name: string, currency: string = 'NGN') => {
        if (!session?.access_token) return;
        setBalances(prev => ({ ...prev, [name]: { querying: true } }));
        try {
            const response = await fetch(`${API_URL}/api/nfi/connectors/${name}/balance?currency=${currency}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data.success) {
                setBalances(prev => ({ 
                    ...prev, 
                    [name]: { balance: data.balance, currency: data.currency, querying: false } 
                }));
                toast.success(`${name.toUpperCase()} balance inquiry successful!`);
            }
        } catch {
            setBalances(prev => ({ ...prev, [name]: { querying: false } }));
            toast.error(`Balance inquiry failed for ${name}`);
        }
    };

    // Trigger reconciliation
    const triggerReconcile = async (name: string) => {
        if (!session?.access_token) return;
        try {
            const response = await fetch(`${API_URL}/api/nfi/connectors/${name}/reconcile`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data.success) {
                toast.success(`Reconciliation complete! Discrepancy: ${data.report.discrepancy} ${data.report.status}`);
            }
        } catch {
            toast.error(`Failed to reconcile ${name}`);
        }
    };

    const handleInvalidate = async (id: string) => {
        if (!confirm('Are you sure you want to hard-invalidate this proposal?')) return;
        if (!session?.access_token) return;
        
        try {
            const response = await fetch(`${API_URL}/api/admin/reconciliation/proposals/${id}/invalidate`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason: 'Admin Rejected' })
            });
            const data = await response.json();
            if (data.success) {
                toast.success('Proposal invalidated successfully');
                fetchProposals();
            } else {
                toast.error(data.error || 'Failed to invalidate');
            }
        } catch {
            toast.error('Network Error');
        }
    };

    const handleForceApprove = async (id: string, severity: string) => {
        if (severity === 'LOW') {
            toast('Low drift proposals auto-apply when the timer expires. No action needed.', { icon: 'ℹ️' });
            return;
        }

        if (!confirm(`WARNING: You are about to bypass the time-lock for a ${severity} drift proposal. Proceed?`)) return;
        if (!session?.access_token) return;

        try {
            const response = await fetch(`${API_URL}/api/admin/reconciliation/proposals/${id}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (data.success) {
                toast.success('Institutional correction applied securely');
                fetchProposals();
            } else {
                toast.error(data.error || 'Failed to approve');
            }
        } catch {
            toast.error('Network Error');
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'AUDITING': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            case 'APPLIED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'INVALIDATED': return 'text-red-400 bg-red-500/10 border-red-500/20';
            default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-3 text-white tracking-tight">
                        <Activity className="text-emerald-500" size={32} />
                        Financial Infrastructure (NFI)
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Enterprise-Grade Multi-Bank Ledger & AI Fraud Intelligence Control Plane
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                    <button
                        onClick={() => setActiveTab('reconciliation')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            activeTab === 'reconciliation'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <ShieldAlert size={16} />
                        Observatory
                    </button>
                    <button
                        onClick={() => setActiveTab('connectors')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            activeTab === 'connectors'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Server size={16} />
                        Connectors
                    </button>
                    <button
                        onClick={() => setActiveTab('ai-intelligence')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            activeTab === 'ai-intelligence'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Brain size={16} />
                        AI Intelligence
                    </button>
                </div>
            </div>

            {/* TAB 1: RECONCILIATION OBSERVATORY */}
            {activeTab === 'reconciliation' && (
                <div className="space-y-6">
                    <div className="flex gap-2 flex-wrap">
                        {['ALL', 'AUDITING', 'APPLIED', 'INVALIDATED'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f as 'ALL' | 'AUDITING' | 'APPLIED' | 'INVALIDATED')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                    filter === f 
                                        ? 'bg-emerald-600 text-white' 
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {loadingProposals && proposals.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">Loading NFI observability engine...</div>
                        ) : proposals.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 border border-white/10 rounded-2xl border-dashed">
                                No proposals found matching current criteria.
                            </div>
                        ) : (
                            proposals.map(p => {
                                const eligible = new Date(p.eligible_at);
                                const isTimeLocked = p.status === 'AUDITING' && now < eligible;
                                
                                return (
                                    <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-emerald-500/30 transition-colors shadow-lg backdrop-blur-md">
                                        <div className="space-y-2 flex-1">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest rounded border ${getStatusStyle(p.status)}`}>
                                                    {p.status}
                                                </span>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                                    p.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                                                    p.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                                    'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                    {p.severity} DRIFT
                                                </span>
                                                <span className="text-xs text-gray-500 font-mono">
                                                    Epoch: {p.settlement_epoch_id}
                                                </span>
                                            </div>

                                            <div className="flex items-baseline gap-2">
                                                <h3 className="text-2xl font-black text-white">
                                                    {p.direction > 0 ? '+' : ''}{p.drift_amount} {p.currency}
                                                </h3>
                                                <span className="text-sm text-gray-400 font-mono truncate max-w-[200px]">
                                                    Wallet: {p.wallets_store?.address || p.wallet_id.substring(0,8)}...
                                                </span>
                                            </div>
                                            
                                            {p.status === 'APPLIED' && (
                                                <div className="text-xs text-emerald-500/80 flex items-center gap-1">
                                                    <CheckCircle size={12} /> Applied {new Date(p.applied_at || p.created_at).toLocaleString()}
                                                </div>
                                            )}
                                            {p.status === 'INVALIDATED' && (
                                                <div className="text-xs text-red-500/80 flex items-center gap-1">
                                                    <XCircle size={12} /> Invalidation Complete.
                                                </div>
                                            )}
                                        </div>

                                        {p.status === 'AUDITING' && (
                                            <div className="flex flex-col items-end gap-3 w-full md:w-auto bg-black/40 p-4 rounded-xl border border-white/10">
                                                <div className="flex items-center gap-2 text-amber-400 font-mono text-xs bg-amber-400/5 px-3 py-1.5 rounded-lg w-full justify-center md:justify-end border border-amber-400/10">
                                                    <Clock size={14} className="animate-pulse" />
                                                    {isTimeLocked 
                                                        ? `T- ${getDistanceToNow(eligible)}` 
                                                        : "Ready to Apply Correction"
                                                    }
                                                </div>

                                                <div className="flex gap-2 w-full md:w-auto">
                                                    <button 
                                                        onClick={() => handleInvalidate(p.id)}
                                                        className="flex-1 md:flex-none px-4 py-2 text-xs font-bold text-red-400 hover:text-white bg-red-400/10 hover:bg-red-600 rounded-lg border border-red-500/20 transition-all"
                                                    >
                                                        Invalidate
                                                    </button>
                                                    
                                                    {(p.severity === 'HIGH' || p.severity === 'MEDIUM') && (
                                                        <button 
                                                            onClick={() => handleForceApprove(p.id, p.severity)}
                                                            className="flex-1 md:flex-none px-4 py-2 text-xs font-bold text-emerald-400 hover:text-white bg-emerald-400/10 hover:bg-emerald-600 rounded-lg border border-emerald-500/20 transition-all flex items-center gap-1.5"
                                                        >
                                                            <AlertTriangle size={12} />
                                                            Force Apply
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: CONNECTOR REGISTRY */}
            {activeTab === 'connectors' && (
                <div className="space-y-6">
                    {loadingConnectors && connectors.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">Loading banking connectors...</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {connectors.map(c => {
                                const h = healthStatus[c.name] || {};
                                const bal = balances[c.name] || {};

                                return (
                                    <div key={c.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 hover:border-emerald-500/20 transition-colors shadow-lg backdrop-blur-md flex flex-col justify-between">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-lg font-bold text-white capitalize flex items-center gap-2">
                                                        <Server size={18} className="text-emerald-500" />
                                                        {c.name}
                                                    </h3>
                                                    <span className="text-xs text-gray-500 font-mono uppercase tracking-wider block mt-1">
                                                        {c.provider_type}
                                                    </span>
                                                </div>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                                    c.status === 'active' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                }`}>
                                                    {c.status}
                                                </span>
                                            </div>

                                            {/* Health & Latency Info */}
                                            <div className="bg-black/35 rounded-xl p-3 space-y-2 border border-white/5">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-gray-400 flex items-center gap-1">
                                                        <HeartPulse size={12} /> Connection Health
                                                    </span>
                                                    <span className={`font-mono font-bold ${
                                                        h.status === 'healthy' ? 'text-emerald-400' :
                                                        h.status === 'unhealthy' ? 'text-red-400' : 'text-gray-500'
                                                    }`}>
                                                        {h.status || 'Not Checked'}
                                                    </span>
                                                </div>
                                                {h.latencyMs !== undefined && (
                                                    <div className="flex justify-between items-center text-xs font-mono">
                                                        <span className="text-gray-500">API Latency</span>
                                                        <span className="text-gray-300 font-bold">{h.latencyMs}ms</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Balance Inquiry Info */}
                                            <div className="bg-black/35 rounded-xl p-3 space-y-2 border border-white/5">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-gray-400 flex items-center gap-1">
                                                        <DollarSign size={12} /> Provider Balance
                                                    </span>
                                                    <span className="text-white font-bold font-mono">
                                                        {bal.balance !== undefined 
                                                            ? `${bal.balance.toLocaleString()} ${bal.currency}`
                                                            : 'Not Queried'
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                                            <button
                                                onClick={() => checkHealth(c.name)}
                                                disabled={h.checking}
                                                className="px-2 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 hover:text-white rounded-lg text-xs font-bold transition-all border border-emerald-500/15 disabled:opacity-50"
                                            >
                                                {h.checking ? 'Checking...' : 'Ping Health'}
                                            </button>
                                            <button
                                                onClick={() => queryBalance(c.name, c.name === 'stripe' ? 'USD' : 'NGN')}
                                                disabled={bal.querying}
                                                className="px-2 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 hover:text-white rounded-lg text-xs font-bold transition-all border border-emerald-500/15 disabled:opacity-50"
                                            >
                                                {bal.querying ? 'Querying...' : 'Balance'}
                                            </button>
                                            <button
                                                onClick={() => triggerReconcile(c.name)}
                                                className="px-2 py-2 bg-emerald-600/15 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-xs font-bold transition-all border border-emerald-500/20"
                                            >
                                                Match Run
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: AI INTELLIGENCE */}
            {activeTab === 'ai-intelligence' && (
                <div className="space-y-6">
                    {loadingAi && !aiInsights ? (
                        <div className="text-center py-12 text-gray-500">Consulting NFI Llama AI intelligence model...</div>
                    ) : (
                        <div className="space-y-6">
                            {/* Analytics overview row */}
                            {analyticsStats && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md">
                                        <div className="text-xs font-semibold text-gray-400 uppercase">30d Total Volume</div>
                                        <div className="text-3xl font-extrabold text-white mt-2 font-mono">
                                            {analyticsStats.volume30d?.toLocaleString()} Units
                                        </div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md">
                                        <div className="text-xs font-semibold text-gray-400 uppercase">30d Deposits</div>
                                        <div className="text-3xl font-extrabold text-white mt-2 font-mono">
                                            {analyticsStats.deposits30d?.toLocaleString()} Units
                                        </div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md">
                                        <div className="text-xs font-semibold text-gray-400 uppercase">30d Withdrawals</div>
                                        <div className="text-3xl font-extrabold text-white mt-2 font-mono">
                                            {analyticsStats.withdrawals30d?.toLocaleString()} Units
                                        </div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-lg backdrop-blur-md">
                                        <div className="text-xs font-semibold text-gray-400 uppercase">Risk Level Assessment</div>
                                        <div className={`text-2xl font-extrabold mt-2 uppercase ${
                                            aiInsights?.riskLevel === 'Low' ? 'text-emerald-400' :
                                            aiInsights?.riskLevel === 'Medium' ? 'text-amber-400' : 'text-red-400'
                                        }`}>
                                            {aiInsights?.riskLevel || 'LOW'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Main AI block */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 bg-gradient-to-br from-emerald-950/20 to-black/40 border border-white/10 rounded-3xl p-6 space-y-6 shadow-xl backdrop-blur-md">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2.5">
                                        <Brain size={24} className="text-emerald-500 animate-pulse" />
                                        NFI AI Core Briefing
                                    </h3>

                                    {aiInsights && (
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-semibold text-gray-400 uppercase">Predictive Cash Flow Forecast</h4>
                                                <p className="text-base text-gray-200 leading-relaxed bg-black/30 p-4 rounded-2xl border border-white/5">
                                                    {aiInsights.forecast}
                                                </p>
                                            </div>

                                            <div className="space-y-3">
                                                <h4 className="text-sm font-semibold text-gray-400 uppercase">System Recommendations</h4>
                                                <ul className="space-y-2.5">
                                                    {aiInsights.suggestions.map((s, idx) => (
                                                        <li key={idx} className="flex gap-3 text-sm text-gray-300 items-start">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
                                                            <span>{s}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <TrendingUp size={20} className="text-emerald-500" />
                                            Efficiency Scoring
                                        </h3>

                                        <div className="relative flex items-center justify-center py-6">
                                            <div className="w-32 h-32 rounded-full border-8 border-white/5 flex flex-col items-center justify-center">
                                                <span className="text-4xl font-black text-white font-mono">
                                                    {aiInsights?.spendingScore || 85}
                                                </span>
                                                <span className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Score</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2.5">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">ledger highlights</h4>
                                            {aiInsights?.smartCategoryHighlights && (
                                                <div className="space-y-2 font-mono text-xs">
                                                    {Object.entries(aiInsights.smartCategoryHighlights).map(([c, val]) => (
                                                        <div key={c} className="flex justify-between items-center text-gray-300">
                                                            <span>{c}</span>
                                                            <span className="font-bold text-emerald-400">{val}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <button 
                                        onClick={fetchAiIntelligence}
                                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-950/20"
                                    >
                                        Re-Analyze Activity
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
