import React from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { formatCurrency } from '../lib/CurrencyFormatter';
import { motion } from 'framer-motion';

interface WalletBalanceCardProps {
    totalBalance: number;
    availableBalance?: number;
    currency: string;
    loading?: boolean;
    showBalance?: boolean;
    onToggleBalance?: () => void;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ 
    totalBalance, 
    availableBalance, 
    currency, 
    loading,
    showBalance = true,
    onToggleBalance
}) => {
    const lockedAmount = (availableBalance !== undefined && availableBalance !== null)
        ? totalBalance - availableBalance
        : 0;
    const hasLocked = lockedAmount > 0.001;
    const displayAvailable = availableBalance ?? totalBalance;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden"
        >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl pointer-events-none" />
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <span className="text-purple-200 text-sm font-medium tracking-wide">TOTAL BALANCE</span>
                        <div className="flex items-center gap-2 mt-1">
                            <h2 className="text-3xl sm:text-4xl font-bold truncate">
                                {loading ? (
                                    <div className="h-10 w-48 bg-white/10 animate-pulse rounded" />
                                ) : (
                                    showBalance ? formatCurrency(totalBalance, currency) : '••••••••'
                                )}
                            </h2>
                            <button 
                                onClick={onToggleBalance}
                                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-purple-200"
                            >
                                {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-6 mt-6 flex-wrap">
                    <div className="text-sm text-purple-200">
                        <span className="block opacity-70 text-xs">Available</span>
                        <span className="font-semibold">{showBalance ? formatCurrency(displayAvailable, currency) : '••••••'}</span>
                    </div>
                    {hasLocked && (
                        <div className="text-sm text-amber-200">
                            <span className="flex items-center gap-1 opacity-70 text-xs">
                                <Lock size={10} /> Locked / Pending
                            </span>
                            <span className="font-semibold">
                                {showBalance ? formatCurrency(lockedAmount, currency) : '••••••'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
