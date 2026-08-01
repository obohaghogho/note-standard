import React from 'react';
import { CurrencyCapability } from '../../hooks/useWalletCapabilities';
import { CheckCircle2, Shield, Clock, Zap } from 'lucide-react';

interface WalletRailSummaryProps {
  capability: CurrencyCapability | null;
  className?: string;
}

export const WalletRailSummary: React.FC<WalletRailSummaryProps> = ({ capability, className = '' }) => {
  if (!capability) return null;

  const depositList = capability.summary?.depositCapabilities || [];
  const withdrawList = capability.summary?.withdrawCapabilities || [];
  const providers = capability.summary?.providers || ['Fincra'];
  const primaryProvider = providers[0] || 'Fincra';
  const backupProvider = providers[1] || null;
  const settlement = capability.summary?.settlementTime || 'Instant';

  return (
    <div className={`rounded-xl p-3 bg-slate-900/70 border border-slate-800 text-xs space-y-2.5 shadow-lg ${className}`}>
      {/* Provider & Health Row */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-semibold">
            Provider: <strong className="text-white capitalize">{primaryProvider}</strong>
            {backupProvider && <span className="text-[9px] text-slate-400 font-normal ml-1">(Backup: {backupProvider})</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-slate-400">Provider Health:</span>
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

      {/* Settlement Row */}
      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1 text-slate-400 font-medium">
          <Clock className="w-3 h-3 text-purple-400 shrink-0" />
          Est. Settlement:
        </span>
        <span className="font-semibold text-purple-300">{settlement}</span>
      </div>
    </div>
  );
};
