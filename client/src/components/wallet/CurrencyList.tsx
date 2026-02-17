import React from 'react';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { motion } from 'framer-motion';
import type { Wallet } from '@/types/wallet';

interface CurrencyListProps {
    wallets: Wallet[];
    rates: Record<string, number>; // Rate to main currency (e.g. USD)
    onSelect: (currency: string) => void;
}

const getCurrencyIcon = (curr: string) => {
    switch (curr) {
        case 'BTC': return '₿';
        case 'ETH': return 'Ξ';
        case 'USD': return '$';
        case 'USDT': return '₮';
        case 'NGN': return '₦';
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'JPY': return '¥';
        default: return '$';
    }
};

const getCurrencyColor = (curr: string) => {
    switch (curr) {
        case 'BTC': return 'from-orange-500/20 to-orange-600/5 text-orange-400 border-orange-500/30';
        case 'ETH': return 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/30';
        case 'USDT': return 'from-emerald-500/20 to-emerald-600/5 text-emerald-400 border-emerald-500/30';
        case 'USD': return 'from-green-500/20 to-green-600/5 text-green-400 border-green-500/30';
        default: return 'from-gray-500/20 to-gray-600/5 text-gray-400 border-gray-500/30';
    }
};

export const CurrencyList: React.FC<CurrencyListProps> = ({ wallets, rates, onSelect }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.map((wallet, index) => {
                const colorClass = getCurrencyColor(wallet.currency);
                const rate = rates[wallet.currency] || 0;
                // If wallet.currency is USD, rate is 1. Else calculate USD value.
                // Assuming rates[currency] gives price of 1 unit in USD.
                const usdValue = wallet.balance * (wallet.currency === 'USD' ? 1 : (rate || 0));

                return (
                    <motion.div
                        key={wallet.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => onSelect(wallet.currency)}
                        className={`p-4 rounded-xl border bg-gradient-to-br ${colorClass} hover:bg-opacity-30 cursor-pointer transition-all hover:scale-[1.02] shadow-sm`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg backdrop-blur-sm">
                                    {getCurrencyIcon(wallet.currency)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">{wallet.currency}</h3>
                                    <p className="text-xs opacity-70">Wallet</p>
                                </div>
                            </div>
                            {wallet.is_frozen && (
                                <span className="bg-red-500/20 text-red-500 text-xs px-2 py-0.5 rounded border border-red-500/30">Frozen</span>
                            )}
                        </div>
                        
                        <div className="mt-4">
                            <p className="text-xl font-bold text-white tracking-tight">
                                {formatCurrency(wallet.balance, wallet.currency)}
                            </p>
                            {wallet.currency !== 'USD' && (
                                <p className="text-xs opacity-60 mt-1">
                                    ≈ {formatCurrency(usdValue, 'USD')}
                                </p>
                            )}
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
};
