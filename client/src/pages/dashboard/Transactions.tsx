import React, { useState, useEffect } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { 
    ArrowDownLeft, 
    ArrowUpRight, 
    Clock, 
    CheckCircle2, 
    XCircle, 
    ChevronLeft, 
    ChevronRight,
    Search,
    FileText,
    ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { walletApi } from '../../lib/walletApi';
import toast from 'react-hot-toast';
import { Button } from '../../components/common/Button';
import { cn } from '../../utils/cn';

interface TransactionDetailModalProps {
    tx: any;
    onClose: () => void;
}

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ tx, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-[#1a1a1a] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-6 text-center border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
                    <div className={cn(
                        "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 text-2xl font-bold",
                        tx.type.includes('IN') || tx.type === 'DEPOSIT' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    )}>
                        {tx.type.includes('IN') || tx.type === 'DEPOSIT' ? <ArrowDownLeft size={32} /> : <ArrowUpRight size={32} />}
                    </div>
                    <h2 className="text-xl font-bold">{tx.display_label || tx.type.replace(/_/g, ' ')}</h2>
                    <p className="text-gray-400 text-sm mt-1">{new Date(tx.created_at).toLocaleString()}</p>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Status</span>
                        <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider border",
                            tx.status === 'COMPLETED' || tx.status === 'confirmed' ? "text-green-500 bg-green-500/10 border-green-500/20" : 
                            tx.status === 'FAILED' ? "text-rose-500 bg-rose-500/10 border-rose-500/20" : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                        )}>
                            {tx.status === 'COMPLETED' || tx.status === 'confirmed' ? <CheckCircle2 size={12} /> : 
                             tx.status === 'FAILED' ? <XCircle size={12} /> : <Clock size={12} className="animate-pulse" />}
                            {tx.status}
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <span className="text-gray-500 text-sm">Amount</span>
                        <span className={cn(
                            "text-lg font-bold",
                            tx.type.includes('IN') || tx.type === 'DEPOSIT' ? "text-green-400" : "text-white"
                        )}>
                            {tx.type.includes('IN') || tx.type === 'DEPOSIT' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                        </span>
                    </div>

                    {tx.exchange_rate && (
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Exchange Rate</span>
                            <span className="text-gray-300">1 {tx.currency} = {tx.exchange_rate} {tx.metadata?.to_currency || 'USD'}</span>
                        </div>
                    )}

                    {tx.fee > 0 && (
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Fee</span>
                            <span className="text-gray-300">{formatCurrency(tx.fee, tx.currency)}</span>
                        </div>
                    )}

                    <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="flex justify-between items-start text-sm">
                            <span className="text-gray-500">From</span>
                            <span className="text-gray-300 text-right max-w-[200px] truncate">
                                {tx.metadata?.sender_address || tx.provider || 'Internal Wallet'}
                            </span>
                        </div>
                        <div className="flex justify-between items-start text-sm">
                            <span className="text-gray-500">To</span>
                            <span className="text-gray-300 text-right max-w-[200px] truncate">
                                {tx.metadata?.receiver_address || 'NoteStandard Wallet'}
                            </span>
                        </div>
                    </div>

                    <div className="pt-4 space-y-3">
                        {tx.status === 'COMPLETED' && (
                            <Button 
                                className="w-full justify-center gap-2"
                                onClick={() => {
                                    toast.promise(walletApi.downloadInvoice(tx.id), {
                                        loading: 'Generating Receipt...',
                                        success: 'Receipt downloaded!',
                                        error: 'Failed to download receipt'
                                    });
                                }}
                            >
                                <FileText size={18} /> Download Receipt
                            </Button>
                        )}
                        <Button variant="ghost" className="w-full text-gray-500 hover:text-white" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Transactions: React.FC = () => {
    const { transactions, loading, refresh } = useWallet();
    const [filteredTransactions, setFilteredTransactions] = useState(transactions);
    const [currencyFilter, setCurrencyFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedTx, setSelectedTx] = useState<any>(null);
    const itemsPerPage = 10;

    const currencies = ['ALL', ...Array.from(new Set(transactions.map(tx => tx.currency)))];
    const statuses = ['ALL', 'COMPLETED', 'PENDING', 'FAILED'];
    const types = ['ALL', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWAP'];

    useEffect(() => {
        let filtered = [...transactions];

        if (currencyFilter !== 'ALL') {
            filtered = filtered.filter(tx => tx.currency === currencyFilter);
        }

        if (statusFilter !== 'ALL') {
             filtered = filtered.filter(tx => {
                const s = tx.status.toUpperCase();
                if (statusFilter === 'COMPLETED') return s === 'COMPLETED' || s === 'CONFIRMED';
                if (statusFilter === 'PENDING') return s === 'PENDING' || s === 'PROCESSING';
                return s === statusFilter;
             });
        }

        if (typeFilter !== 'ALL') {
             filtered = filtered.filter(tx => tx.type.toUpperCase().includes(typeFilter));
        }

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(tx => 
                tx.id.toLowerCase().includes(lowerSearch) || 
                (tx.display_label || '').toLowerCase().includes(lowerSearch) ||
                (tx.reference_id || '').toLowerCase().includes(lowerSearch)
            );
        }

        setFilteredTransactions(filtered);
        setCurrentPage(1);
    }, [transactions, currencyFilter, statusFilter, typeFilter, searchTerm]);

    const paginatedTransactions = filteredTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

    const getStatusStyles = (status: string) => {
        const s = status.toUpperCase();
        if (s === 'COMPLETED' || s === 'CONFIRMED') return 'text-green-500 bg-green-500/10 border-green-500/20';
        if (s === 'FAILED') return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
        return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    };

    const getStatusIcon = (status: string) => {
        const s = status.toUpperCase();
        if (s === 'COMPLETED' || s === 'CONFIRMED') return <CheckCircle2 size={12} />;
        if (s === 'FAILED') return <XCircle size={12} />;
        return <Clock size={12} className="animate-pulse" />;
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden flex flex-col w-full max-w-full">
            <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-full overflow-hidden">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                             Transactions
                        </h1>
                        <p className="text-gray-400 mt-1">Detailed history of all your financial activities</p>
                    </div>
                    <Button onClick={refresh} className="bg-white/5 border-white/10 hover:bg-white/10" variant="outline">
                        Refresh
                    </Button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative group min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-white transition-colors" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search by ID or Reference..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-white/10 transition-all text-sm"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
                        {statuses.map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={cn(
                                    "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                                    statusFilter === s ? "bg-white text-black shadow-lg" : "text-gray-400 hover:text-white"
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <select 
                            value={currencyFilter}
                            onChange={(e) => setCurrencyFilter(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-white/10 appearance-none"
                        >
                            {currencies.map(c => <option key={c} value={c} className="bg-black">{c} Currencies</option>)}
                        </select>

                        <select 
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-white/10 appearance-none"
                        >
                            {types.map(t => <option key={t} value={t} className="bg-black">{t}</option>)}
                        </select>
                    </div>
                </div>

                {/* Table Section */}
                <div className="bg-[#111] border border-white/5 rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0 min-w-0">
                    <div className="overflow-x-auto overflow-y-auto flex-1 h-full min-w-0 overscroll-x-none">
                        <table className="w-full text-left border-collapse min-w-[800px] table-fixed">
                            <thead>
                                <tr className="border-b border-white/5 text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                                    <th className="py-5 px-6 w-1/4">Type & Description</th>
                                    <th className="py-5 px-4 w-1/6">From → To</th>
                                    <th className="py-5 px-4 w-1/6 text-right">Amount</th>
                                    <th className="py-5 px-4 w-1/6 text-right">Rate / Fee</th>
                                    <th className="py-5 px-4 w-1/6 text-center">Status</th>
                                    <th className="py-5 px-6 w-1/6 text-right">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {paginatedTransactions.map((tx) => (
                                    <tr 
                                        key={tx.id} 
                                        className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                                        onClick={() => setSelectedTx(tx)}
                                    >
                                        <td className="py-5 px-6 truncate">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                                    tx.type.includes('IN') || tx.type === 'DEPOSIT' ? "bg-green-500/10 text-green-400" : 
                                                    tx.type === 'SWAP' ? "bg-purple-500/10 text-purple-400" : "bg-red-500/10 text-red-400"
                                                )}>
                                                    {tx.type.includes('IN') || tx.type === 'DEPOSIT' ? <ArrowDownLeft size={18} /> : 
                                                     tx.type.includes('SWAP') ? <ArrowRight size={18} /> : <ArrowUpRight size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm truncate">{tx.display_label || tx.type.replace(/_/g, ' ')}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono">#{tx.id.substring(0, 12)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-5 px-4">
                                            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                                                <span className="bg-white/5 px-2 py-0.5 rounded uppercase">{tx.currency}</span>
                                                <ArrowRight size={12} className="text-gray-600" />
                                                <span className="bg-white/5 px-2 py-0.5 rounded uppercase italic">{tx.metadata?.to_currency || tx.currency}</span>
                                            </div>
                                        </td>
                                        <td className={cn(
                                            "py-5 px-4 text-right font-black text-sm",
                                            tx.type.includes('IN') || tx.type === 'DEPOSIT' ? "text-green-400" : "text-white"
                                        )}>
                                            {tx.type.includes('IN') || tx.type === 'DEPOSIT' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                                        </td>
                                        <td className="py-5 px-4 text-right">
                                            <div className="space-y-1">
                                                {tx.exchange_rate ? (
                                                    <p className="text-[11px] font-mono text-gray-400">{tx.exchange_rate.toFixed(4)}</p>
                                                ) : <p className="text-[11px] text-gray-600">—</p>}
                                                <p className="text-[10px] text-rose-500/80">{tx.fee > 0 ? `Fee: ${formatCurrency(tx.fee, tx.currency)}` : ''}</p>
                                            </div>
                                        </td>
                                        <td className="py-5 px-4 text-center">
                                            <div className={cn(
                                                "inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
                                                getStatusStyles(tx.status)
                                            )}>
                                                {getStatusIcon(tx.status)}
                                                {tx.status}
                                            </div>
                                        </td>
                                        <td className="py-5 px-6 text-right">
                                            <div className="space-y-0.5">
                                                <p className="text-xs font-bold">{new Date(tx.created_at).toLocaleDateString()}</p>
                                                <p className="text-[10px] text-gray-500">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-6 border-t border-white/5 flex items-center justify-between">
                            <p className="text-xs text-gray-500">
                                Showing <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredTransactions.length)}</span> of <span className="text-white">{filteredTransactions.length}</span> transactions
                            </p>
                            <div className="flex items-center gap-2">
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="p-2 border-white/5 hover:bg-white/5 disabled:opacity-30"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft size={16} />
                                </Button>
                                <div className="flex items-center gap-1">
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setCurrentPage(i + 1)}
                                            className={cn(
                                                "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                                                currentPage === i + 1 ? "bg-white text-black" : "text-gray-500 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="p-2 border-white/5 hover:bg-white/5 disabled:opacity-30"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight size={16} />
                                </Button>
                            </div>
                        </div>
                    )}

                    {filteredTransactions.length === 0 && !loading && (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white/[0.01]">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                <Search size={24} className="text-gray-500" />
                            </div>
                            <h3 className="text-lg font-bold">No transactions found</h3>
                            <p className="text-gray-500 text-sm mt-1 max-w-xs text-center">Try adjusting your filters or search term to find what you're looking for.</p>
                        </div>
                    )}
                </div>
            </div>

            {selectedTx && <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
        </div>
    );
};
