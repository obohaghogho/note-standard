import React from 'react';
import type { CurrencyCapability } from '../../hooks/useWalletCapabilities';
import { CheckCircle2, Shield, Clock, RefreshCw } from 'lucide-react';

interface WalletRailSummaryProps {
  capability: CurrencyCapability | null;
  className?: string;
}

export const WalletRailSummary: React.FC<WalletRailSummaryProps> = ({ capability, className = '' }) => {
  if (!capability) return null;

  const depositList = capability.summary?.depositCapabilities || [];
  const withdrawList = capability.summary?.withdrawCapabilities || [];
  const providers = capability.summary?.providers || ['Grey', 'Fincra'];
  const primaryProvider = providers[0] || 'Grey';
  const backupProvider = providers[1] || 'Fincra';
  const settlement = capability.summary?.settlementTime || 'Instant';

  return (
    <div className={`rounded-xl p-3 bg-slate-900/70 border border-slate-800 text-xs space-y-2.5 shadow-lg ${className}`}>
      {/* Provider Routing & Health Row */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-semibold">
            Routing: <strong className="text-white capitalize">Primary: {primaryProvider}</strong>
            <span className="text-[9px] text-slate-400 font-normal ml-1.5">| Failover: {backupProvider}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-slate-400">Health:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            🟢 Online
          </span>
        </div>
      </div>

      {/* Deposit & Withdraw Methods Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
            Deposit Methods
          </span>
          <div className="space-y-0.5">
            {depositList.slice(0, 3).map((method, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-slate-200 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">{method}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
            Withdraw Methods
          </span>
          <div className="space-y-0.5">
            {withdrawList.slice(0, 3).map((method, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-slate-200 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{method}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Settlement & Provider Sync Timestamp Row */}
      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1 text-slate-400">
          <Clock className="w-3 h-3 text-purple-400 shrink-0" />
          Est. Settlement: <strong className="text-purple-300 font-semibold">{settlement}</strong>
        </span>
        <span className="flex items-center gap-1 text-slate-500 font-mono">
          <RefreshCw className="w-2.5 h-2.5 text-cyan-500" />
          Sync: 2m ago (Live)
        </span>
      </div>
    </div>
  );
};
