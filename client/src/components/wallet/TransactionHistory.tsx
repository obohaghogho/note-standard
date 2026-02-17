import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, FileText } from 'lucide-react';
import type { Transaction } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { walletApi } from '../../lib/walletApi';
import toast from 'react-hot-toast';

interface TransactionHistoryProps {
    transactions: Transaction[];
    className?: string;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, className = '' }) => {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'COMPLETED': return <CheckCircle2 size={16} className="text-green-500" />;
            case 'FAILED': return <XCircle size={16} className="text-red-500" />;
            case 'PENDING': return <Clock size={16} className="text-yellow-500" />;
            default: return <Clock size={16} className="text-gray-500" />;
        }
    };

    const getTypeColor = (type: string) => {
        return type.includes('DEPOSIT') || type.includes('IN') ? 'text-green-400' : 'text-white';
    };

    return (
        <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg ${className}`}>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                Recent Activity
            </h3>
            
            <div className="overflow-hidden">
                {transactions.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        <p>No recent transactions</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                                    <th className="pb-3 pl-2 font-medium">Type</th>
                                    <th className="pb-3 font-medium">Date</th>
                                    <th className="pb-3 font-medium text-right">Amount</th>
                                    <th className="pb-3 pr-2 font-medium text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {transactions.map((tx) => (
                                    <tr key={tx.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="py-4 pl-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-full ${
                                                    tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? 'bg-green-500/10 text-green-400' : 
                                                    tx.type === 'SWAP' ? 'bg-purple-500/10 text-purple-400' : 'bg-red-500/10 text-red-400'
                                                }`}>
                                                    {tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? <ArrowDownLeft size={16} /> : 
                                                     tx.type === 'SWAP' ? <Clock size={16} /> : <ArrowUpRight size={16} />}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-gray-200">
                                                        {tx.display_label || tx.type.replace(/_/g, ' ')}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 font-mono hidden sm:block">
                                                        #{tx.id.substring(0, 8)}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 text-xs text-gray-400">
                                            {new Date(tx.created_at).toLocaleDateString()}
                                            <span className="block opacity-50">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </td>
                                        <td className={`py-4 text-sm font-medium text-right ${getTypeColor(tx.type)}`}>
                                            {tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? '+' : '-'}
                                            {formatCurrency(tx.amount, tx.currency)}
                                        </td>
                                        <td className="py-4 pr-2 text-right">
                                            <div className="flex items-centerjustify-end gap-2 justify-end">
                                                <div className="flex items-center gap-1.5 bg-gray-900/50 px-2 py-1 rounded text-xs">
                                                    {getStatusIcon(tx.status)}
                                                    <span className={
                                                        tx.status === 'COMPLETED' ? 'text-green-500' :
                                                        tx.status === 'FAILED' ? 'text-red-500' : 'text-yellow-500'
                                                    }>{tx.status}</span>
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
                                                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
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
            
            {transactions.length > 0 && (
                <div className="mt-4 text-center">
                    <button className="text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors">
                        View All History
                    </button>
                </div>
            )}
        </div>
    );
};
