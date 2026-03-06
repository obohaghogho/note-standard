import React, { useState, useEffect } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { walletApi } from '../../api/walletApi';
import type { LedgerEntry } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { motion } from 'framer-motion';

interface LedgerTrailProps {
    className?: string;
    refreshKey?: number; // Change this to trigger a refresh
}

export const LedgerTrail: React.FC<LedgerTrailProps> = ({ className = '', refreshKey }) => {
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEntries = async () => {
            try {
                setLoading(true);
                const data = await walletApi.getLedgerEntries(5);
                setEntries(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Error fetching ledger entries", err);
                setEntries([]);
            } finally {
                setLoading(false);
            }
        };
        fetchEntries();
    }, [refreshKey]);

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            'deposit': 'Deposit',
            'withdrawal': 'Withdrawal',
            'transfer_out': 'Sent',
            'transfer_in': 'Received',
            'swap_debit': 'Swap Out',
            'swap_credit': 'Swap In',
            'fee': 'Service Fee',
            'payout': 'Payout',
            'affiliate_commission': 'Commission',
            'subscription_payment': 'Subscription',
        };
        return labels[type] || type.replace(/_/g, ' ');
    };

    return (
        <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg ${className}`}>
            <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
                <BookOpen size={16} className="text-indigo-400" />
                Ledger Audit Trail
                <span className="text-[10px] font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full ml-auto">
                    Last 5 entries
                </span>
            </h3>

            {loading ? (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin text-indigo-400" size={20} />
                </div>
            ) : entries.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">No ledger entries yet</p>
            ) : (
                <div className="space-y-2">
                    {entries.map((entry, index) => {
                        const isCredit = entry.amount > 0;

                        return (
                            <motion.div
                                key={entry.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 transition-colors"
                            >
                                <div className={`p-1.5 rounded-full ${
                                    isCredit 
                                        ? 'bg-emerald-500/10 text-emerald-400' 
                                        : 'bg-red-500/10 text-red-400'
                                }`}>
                                    {isCredit 
                                        ? <TrendingUp size={14} /> 
                                        : <TrendingDown size={14} />
                                    }
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-200 capitalize truncate">
                                        {getTypeLabel(entry.type)}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        {new Date(entry.created_at).toLocaleString([], {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>

                                <div className="text-right">
                                    <p className={`text-xs font-bold ${
                                        isCredit ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                        {isCredit ? '+' : ''}{formatCurrency(entry.amount, entry.currency)}
                                    </p>
                                    <p className="text-[10px] text-gray-500 font-mono">
                                        {entry.currency}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
