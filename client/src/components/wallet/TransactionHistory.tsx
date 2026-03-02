import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, FileText, Search, Filter } from 'lucide-react';
import type { Transaction } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { walletApi } from '../../lib/walletApi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface TransactionHistoryProps {
    transactions: Transaction[];
    loading?: boolean;
    className?: string;
}

type FilterType = 'all' | 'deposits' | 'withdrawals' | 'swaps' | 'transfers';

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ 
    transactions, 
    loading = false,
    className = '' 
}) => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    const filters: { label: string; value: FilterType }[] = [
        { label: 'All', value: 'all' },
        { label: 'Deposits', value: 'deposits' },
        { label: 'Withdrawals', value: 'withdrawals' },
        { label: 'Swaps', value: 'swaps' },
        { label: 'Transfers', value: 'transfers' },
    ];

    const matchesFilter = (tx: Transaction): boolean => {
        const t = tx.type.toUpperCase();
        switch (activeFilter) {
            case 'deposits':
                return t.includes('DEPOSIT') || t === 'FUNDING';
            case 'withdrawals':
                return t.includes('WITHDRAWAL') || t.includes('PAYOUT');
            case 'swaps':
                return t.includes('SWAP');
            case 'transfers':
                return t.includes('TRANSFER');
            default:
                return true;
        }
    };

    const matchesSearch = (tx: Transaction): boolean => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (tx.display_label || '').toLowerCase().includes(q) ||
            tx.type.toLowerCase().includes(q) ||
            tx.id.toLowerCase().includes(q) ||
            (tx.currency || '').toLowerCase().includes(q) ||
            (tx.from_currency || '').toLowerCase().includes(q) ||
            (tx.to_currency || '').toLowerCase().includes(q)
        );
    };

    const safeTransactions = Array.isArray(transactions) ? transactions : [];
    const filteredTransactions = safeTransactions.filter(tx => matchesFilter(tx) && matchesSearch(tx));

    const getStatusIcon = (status: string) => {
        const s = (status || '').toUpperCase();
        switch (s) {
            case 'COMPLETED':
            case 'CONFIRMED': 
                return <CheckCircle2 size={12} />;
            case 'FAILED':
            case 'REJECTED':
                return <XCircle size={12} />;
            case 'PENDING':
            case 'PROCESSING':
                return <Clock size={12} className="animate-spin-slow" />;
            default: 
                return <Clock size={12} />;
        }
    };

    const getStatusColor = (status: string) => {
        const s = (status || '').toUpperCase();
        switch (s) {
            case 'COMPLETED':
            case 'CONFIRMED': 
                return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'FAILED':
            case 'REJECTED':
                return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
            default:
                return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        }
    };

    const getTypeColor = (type: string) => {
        const t = type.toUpperCase();
        if (t.includes('DEPOSIT') || t === 'TRANSFER_IN' || t === 'SWAP_IN' || t === 'SWAP_CREDIT') return 'text-green-400';
        if (t === 'SWAP' || t === 'SWAP_OUT' || t === 'SWAP_DEBIT') return 'text-purple-400';
        return 'text-white';
    };

    const isCredit = (type: string) => {
        const t = type.toUpperCase();
        return t === 'DEPOSIT' || t === 'TRANSFER_IN' || t === 'SWAP_IN' || t === 'SWAP_CREDIT' || t === 'AFFILIATE_COMMISSION';
    };

    return (
        <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl ${className}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-bold">Recent Activity</h3>
                    <p className="text-xs text-gray-400 mt-1">Your latest financial movements</p>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        id="history-search"
                        name="history-search"
                        type="text"
                        placeholder="Search reference or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-xl text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all font-medium"
                    />
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
                {filters.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setActiveFilter(f.value)}
                        className={`px-4 py-1.5 text-xs font-bold rounded-full whitespace-nowrap transition-all border ${
                            activeFilter === f.value
                                ? 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/20'
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600 hover:text-gray-300'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
            
            <div className="overflow-hidden">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center justify-between py-4 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-800" />
                                    <div className="space-y-2">
                                        <div className="h-4 w-24 bg-gray-800 rounded" />
                                        <div className="h-2 w-16 bg-gray-800 rounded" />
                                    </div>
                                </div>
                                <div className="space-y-2 text-right">
                                    <div className="h-4 w-20 bg-gray-800 rounded ml-auto" />
                                    <div className="h-4 w-16 bg-gray-800 rounded ml-auto" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="text-center py-16 bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                        <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Filter size={24} className="text-gray-600" />
                        </div>
                        <p className="text-gray-400 font-medium">{safeTransactions.length === 0 ? 'No recent transactions' : 'No matches found'}</p>
                        <button onClick={() => {setSearchQuery(''); setActiveFilter('all')}} className="text-purple-400 text-xs mt-2 hover:underline">Clear all filters</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="text-gray-500 text-[11px] uppercase tracking-[0.1em] border-b border-gray-800/50 font-bold">
                                    <th className="pb-4 pl-2">Transaction Type</th>
                                    <th className="pb-4">Timestamp</th>
                                    <th className="pb-4 text-right">Amount</th>
                                    <th className="pb-4 pr-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/30">
                                {filteredTransactions?.map((tx) => (
                                    <tr key={tx.id} className="group hover:bg-white/[0.02] transition-colors rounded-lg">
                                        <td className="py-4 pl-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                                                    (() => {
                                                        const t = tx.type.toUpperCase();
                                                        if (t === 'DEPOSIT' || t === 'TRANSFER_IN' || t === 'SWAP_IN' || t === 'SWAP_CREDIT') return 'bg-emerald-500/10 text-emerald-400';
                                                        if (t === 'SWAP' || t === 'SWAP_OUT' || t === 'SWAP_DEBIT') return 'bg-purple-500/10 text-purple-400';
                                                        return 'bg-rose-500/10 text-rose-400';
                                                    })()
                                                }`}>
                                                    {isCredit(tx.type) ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-gray-100 truncate">
                                                        {tx.display_label || tx.type.replace(/_/g, ' ')}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[10px] text-gray-500 font-mono tracking-tight bg-gray-800/50 px-1.5 rounded">
                                                            {tx.txn_reference || `#${tx.id.substring(0, 8)}`}
                                                        </p>
                                                        {tx.from_currency && tx.to_currency && tx.from_currency !== tx.to_currency && (
                                                            <span className="text-[10px] text-purple-400 font-bold">
                                                                {tx.from_currency} → {tx.to_currency}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 text-[11px] text-gray-400">
                                            <span className="font-medium">{new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            <span className="block opacity-40 font-mono mt-0.5">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </td>
                                        <td className={`py-4 text-sm font-black text-right ${getTypeColor(tx.type)}`}>
                                            {isCredit(tx.type) ? '+' : '-'}
                                            {formatCurrency(tx.amount || tx.amount_from || 0, tx.currency || tx.from_currency || 'USD')}
                                        </td>
                                        <td className="py-4 pr-2 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${getStatusColor(tx.status)}`}>
                                                    {getStatusIcon(tx.status)}
                                                    <span>{tx.status}</span>
                                                </div>
                                                {tx.status === 'COMPLETED' && (
                                                    <button 
                                                        onClick={() => {
                                                            toast.promise(walletApi.downloadInvoice(tx.id), {
                                                                loading: 'Fetching invoice...',
                                                                success: 'Invoice downloaded!',
                                                                error: 'Failed to download pdf'
                                                            });
                                                        }}
                                                        className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                                        title="Download Invoice"
                                                    >
                                                        <FileText size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            {!loading && safeTransactions.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-800/50 flex justify-center">
                    <button 
                        onClick={() => navigate('/transactions')}
                        className="group flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-purple-400 transition-all bg-gray-800/50 px-4 py-2 rounded-full hover:bg-purple-500/10"
                    >
                        View Full Transaction History
                        <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </button>
                </div>
            )}
        </div>
    );
};
