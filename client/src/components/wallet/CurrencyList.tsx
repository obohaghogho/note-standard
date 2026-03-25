import React from 'react';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { motion } from 'framer-motion';
import type { Wallet } from '@/types/wallet';
import toast from 'react-hot-toast';

interface CurrencyListProps {
    wallets: Wallet[];
    rates: Record<string, number>; // Rate to main currency (e.g. USD)
    onSelect: (currency: string, network?: string) => void;
    showBalances?: boolean;
}

const getCurrencyIcon = (curr: string) => {
    const code = curr.toUpperCase();
    if (code === 'USDT') return '₮';
    if (code === 'USDC') return 'U';
    switch (code) {
        case 'BTC': return '₿';
        case 'ETH': return 'Ξ';
        case 'USD': return '$';
        case 'NGN': return '₦';
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'JPY': return '¥';
        default: return '$';
    }
};

const getCurrencyColor = (curr: string) => {
    const code = curr.toUpperCase();
    if (code === 'USDT') return 'from-emerald-500/20 to-emerald-600/5 text-emerald-400 border-emerald-500/30';
    if (code === 'USDC') return 'from-blue-400/20 to-blue-500/5 text-blue-300 border-blue-400/30';
    switch (code) {
        case 'BTC': return 'from-orange-500/20 to-orange-600/5 text-orange-400 border-orange-500/30';
        case 'ETH': return 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/30';
        case 'USD': return 'from-green-500/20 to-green-600/5 text-green-400 border-green-500/30';
        case 'NGN': return 'from-teal-500/20 to-teal-600/5 text-teal-400 border-teal-500/30';
        case 'EUR': return 'from-indigo-500/20 to-indigo-600/5 text-indigo-400 border-indigo-500/30';
        case 'GBP': return 'from-purple-500/20 to-purple-600/5 text-purple-400 border-purple-500/30';
        case 'JPY': return 'from-rose-500/20 to-rose-600/5 text-rose-400 border-rose-500/30';
        default: return 'from-gray-500/20 to-gray-600/5 text-gray-400 border-gray-500/30';
    }
};

export const CurrencyList: React.FC<CurrencyListProps> = ({ 
    wallets, 
    rates, 
    onSelect,
    showBalances = true
}) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Array.isArray(wallets) ? wallets : []).map((wallet, index) => {
                const colorClass = getCurrencyColor(wallet.currency);
                const rate = rates[wallet.currency] || 0;
                const usdValue = wallet.balance * (wallet.currency === 'USD' ? 1 : (rate || 0));
                const availableBalance = wallet.available_balance ?? wallet.balance;
                const hasLocked = (wallet.balance - availableBalance) > 0.001;

                return (
                    <motion.div
                        key={wallet.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => onSelect(wallet.currency, wallet.network)}
                        className={`p-4 rounded-xl border bg-gradient-to-br ${colorClass} hover:bg-opacity-30 cursor-pointer transition-all hover:scale-[1.02] shadow-sm`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg backdrop-blur-sm">
                                    {getCurrencyIcon(wallet.currency)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex justify-between items-center gap-2">
                                        <h3 className="font-bold text-white truncate flex items-center gap-1.5">
                                            {wallet.currency}
                                            {wallet.network && wallet.network !== 'native' && wallet.network !== 'internal' && (
                                                <span className="text-[9px] bg-white/10 px-1 rounded uppercase tracking-tighter opacity-70">
                                                    {wallet.network}
                                                </span>
                                            )}
                                        </h3>
                                        {wallet.currency !== 'USD' && (
                                            <div className="flex items-center gap-1.5 bg-black/20 px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-md">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
                                                <p className="text-[10px] font-black text-white whitespace-nowrap">
                                                    {rate > 0 
                                                        ? (rate < 0.01 ? `$${rate.toFixed( rate < 0.0001 ? 6 : 4 )}` : formatCurrency(rate, 'USD')) 
                                                        : '...'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs opacity-70">{wallet.provider === 'nowpayments' ? 'External Service' : 'Secure Storage'}</p>
                                </div>
                            </div>
                            {wallet.is_frozen && (
                                <span className="bg-red-500/20 text-red-500 text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 shrink-0">Frozen</span>
                            )}
                        </div>
                        
                        <div className="mt-4 space-y-2">
                            <div>
                                <p className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                                    {showBalances ? formatCurrency(wallet.balance, wallet.currency) : '••••••••'}
                                </p>
                                {hasLocked && (
                                    <p className="text-[10px] text-amber-300/80 mt-0.5 font-medium">
                                        {showBalances ? `Available: ${formatCurrency(availableBalance, wallet.currency)}` : 'Available: ••••'}
                                    </p>
                                )}
                                {wallet.currency !== 'USD' && (
                                    <p className="text-xs text-white/50 mt-1">
                                        ≈ {showBalances ? formatCurrency(usdValue, 'USD') : '••••'}
                                    </p>
                                )}
                            </div>

                            {/* Wallet Address for Crypto */}
                            {['BTC', 'ETH', 'USDT', 'USDC'].some(c => wallet.currency.startsWith(c)) && wallet.address && (
                                <div className="pt-2 border-t border-white/5 mt-2">
                                    <div className="flex items-center justify-between gap-2 bg-black/20 p-2 rounded-lg group/addr transition-colors hover:bg-black/30">
                                        <p className="text-[10px] font-mono text-white/40 truncate select-all" title={wallet.address}>
                                            {wallet.address.length > 12 
                                                ? `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`
                                                : wallet.address
                                            }
                                        </p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(wallet.address);
                                                toast.success(`${wallet.currency} address copied!`);
                                            }}
                                            className="text-[10px] text-white/20 hover:text-white/60 transition-colors"
                                            title="Copy Full Address"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
};
