import React from 'react';
import { Eye, EyeOff, Lock, Info, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

interface WalletBalanceCardProps {
    totalBalance: string;     // Formatted string from DTO
    availableBalance: string; // Formatted string from DTO
    currency: string;
    loading?: boolean;
    showBalance?: boolean;
    onToggleBalance?: () => void;
    evaluationId?: string;
    frozenAssets?: string[];
    systemStale?: boolean;
    regime?: string;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ 
    totalBalance, 
    availableBalance, 
    loading,
    showBalance = true,
    onToggleBalance,
    evaluationId,
    frozenAssets,
    systemStale,
    regime
}) => {
    // Note: Locked calculations are now performed in the FinancialViewService
    // We simply display what we are given by the DTO.
    // If we need to show 'Locked' explicitly, the DTO should provide it.
    // For now, we compare if strings match or if we should add a separate 'locked' field.
    // To maintain current UI logic without math: we'll check if available !== total
    const hasLocked = availableBalance !== totalBalance;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden border border-white/5"
        >
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                             <span className="text-blue-300/60 text-[10px] font-bold tracking-[0.2em] uppercase">Total Account Valuation</span>
                             {evaluationId && (
                                 <div className="group relative">
                                     <div className="cursor-help p-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
                                         <Info size={12} className="text-blue-400/70" />
                                     </div>
                                     {/* Valuation Inspector Popover (DFOS v6.0) */}
                                     <div className="absolute left-0 bottom-full mb-3 hidden group-hover:block z-50 w-64 p-4 rounded-xl bg-slate-900 border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                                         <div className="space-y-3 font-sans">
                                             <div className="flex justify-between items-center">
                                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Forensic Audit</span>
                                                 <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">DFOS v6.0</span>
                                             </div>
                                             <div className="space-y-1.5">
                                                 <div className="flex justify-between text-[11px]">
                                                     <span className="text-slate-500">Authority:</span>
                                                     <span className="text-emerald-400 font-medium">SNAPSHOT_LEDGER</span>
                                                 </div>
                                                 <div className="flex justify-between text-[11px]">
                                                     <span className="text-slate-500">Evaluation ID:</span>
                                                     <span className="text-slate-300 font-mono truncate ml-2">
                                                         {evaluationId.substring(0, 12)}...
                                                     </span>
                                                 </div>
                                                 <div className="flex justify-between text-[11px]">
                                                     <span className="text-slate-500">Market Regime:</span>
                                                     <span className={regime === 'VOLATILE' ? "text-amber-400 font-medium" : "text-emerald-400 font-medium"}>
                                                         {regime || 'STABLE'}
                                                     </span>
                                                 </div>
                                                 {systemStale && (
                                                     <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-medium pt-1">
                                                         <AlertTriangle size={10} />
                                                         LKG_STALE_EXPLICIT_ACTIVE
                                                     </div>
                                                 )}
                                                 {frozenAssets && frozenAssets.length > 0 && (
                                                     <div className="pt-2 border-t border-white/5">
                                                         <span className="text-[10px] text-red-400 font-bold block mb-1">SCOPED FREEZES:</span>
                                                         <div className="flex flex-wrap gap-1">
                                                             {frozenAssets.map(a => (
                                                                 <span key={a} className="px-1 py-0.5 rounded bg-red-500/10 text-red-500 text-[9px] border border-red-500/20">{a}</span>
                                                             ))}
                                                         </div>
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             )}
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                                {loading ? (
                                    <div className="h-12 w-48 bg-white/5 animate-pulse rounded-lg" />
                                ) : (
                                    showBalance ? totalBalance : '••••••••'
                                )}
                            </h2>
                            <button 
                                onClick={onToggleBalance}
                                className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white"
                            >
                                {showBalance ? <Eye size={22} /> : <EyeOff size={22} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-6 mt-6 flex-wrap">
                    <div className="text-sm text-purple-200">
                        <span className="block opacity-70 text-xs text-purple-300">Available Valuation</span>
                        <span className="font-semibold text-lg">{showBalance ? availableBalance : '••••••'}</span>
                    </div>
                    {hasLocked && (
                        <div className="text-sm text-amber-200">
                            <span className="flex items-center gap-1 opacity-70 text-xs">
                                <Lock size={10} /> Escrowed / Locked
                            </span>
                            <span className="font-semibold text-lg text-amber-400">
                                {showBalance ? 'View Managed Funds' : '••••••'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
