import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, CheckCircle, Clock, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

import toast from 'react-hot-toast';

// Helper to format distance to now natively
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

export const ReconciliationDashboard: React.FC = () => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'AUDITING' | 'APPLIED' | 'INVALIDATED'>('ALL');
    const [now, setNow] = useState(new Date());

    const fetchProposals = useCallback(async () => {
        setLoading(true);
        try {
            const statusQ = filter === 'ALL' ? '' : `?status=${filter}`;
            // We use the raw fetch here since backend method adminApi might not have this yet
            const response = await fetch(`/api/admin/reconciliation/proposals${statusQ}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json();
            if (data.success) {
                setProposals(data.proposals);
            }
        } catch {
            toast.error('Failed to fetch reconciliation proposals');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchProposals();
        // Update countdowns every second
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, [fetchProposals]);

    const handleInvalidate = async (id: string) => {
        if (!confirm('Are you sure you want to hard-invalidate this proposal?')) return;
        
        try {
            const response = await fetch(`/api/admin/reconciliation/proposals/${id}/invalidate`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
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

        try {
            const response = await fetch(`/api/admin/reconciliation/proposals/${id}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
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
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldAlert className="text-purple-500" />
                        Reconciliation Observatory
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Monitor Autonomous Drift Corrections & Overrides
                    </p>
                </div>
                <button 
                    onClick={fetchProposals}
                    className="p-2 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {['ALL', 'AUDITING', 'APPLIED', 'INVALIDATED'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f as 'ALL' | 'AUDITING' | 'APPLIED' | 'INVALIDATED')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            filter === f 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 gap-4">
                {loading && proposals.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">Loading observability engine...</div>
                ) : proposals.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 border border-gray-800 rounded-xl border-dashed">
                        No proposals found matching criteria.
                    </div>
                ) : (
                    proposals.map(p => {
                        const eligible = new Date(p.eligible_at);
                        const isTimeLocked = p.status === 'AUDITING' && now < eligible;
                        
                        return (
                            <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-700 transition-colors shadow-lg">
                                
                                {/* Info Panel */}
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-3">
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
                                        <h3 className="text-2xl font-black">
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
                                            <XCircle size={12} /> Killed gracefully.
                                        </div>
                                    )}
                                </div>

                                {/* Active Controls */}
                                {p.status === 'AUDITING' && (
                                    <div className="flex flex-col items-end gap-3 w-full md:w-auto bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                                        {/* Timer */}
                                        <div className="flex items-center gap-2 text-amber-400 font-mono text-sm bg-amber-400/5 px-3 py-1.5 rounded w-full justify-center md:justify-end border border-amber-400/10">
                                            <Clock size={16} className="animate-pulse" />
                                            {isTimeLocked 
                                                ? `T- ${getDistanceToNow(eligible)}` 
                                                : "Eligible for Execution"
                                            }
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <button 
                                                onClick={() => handleInvalidate(p.id)}
                                                className="flex-1 md:flex-none px-4 py-2 text-xs font-bold text-red-400 hover:text-white bg-red-400/10 hover:bg-red-500 rounded border border-red-500/20 transition-all"
                                            >
                                                Invalidate
                                            </button>
                                            
                                            {(p.severity === 'HIGH' || p.severity === 'MEDIUM') && (
                                                <button 
                                                    onClick={() => handleForceApprove(p.id, p.severity)}
                                                    className="flex-1 md:flex-none px-4 py-2 text-xs font-bold text-emerald-400 hover:text-white bg-emerald-400/10 hover:bg-emerald-600 rounded border border-emerald-500/20 transition-all flex items-center gap-1"
                                                >
                                                    <AlertTriangle size={12} />
                                                    Force Approve
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
    );
};
