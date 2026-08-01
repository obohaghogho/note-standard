import React from 'react';
import { CurrencyCapability } from '../../hooks/useWalletCapabilities';
import { CheckCircle2, Zap } from 'lucide-react';

interface WalletRailSummaryProps {
  capability: CurrencyCapability | null;
  className?: string;
}

export const WalletRailSummary: React.FC<WalletRailSummaryProps> = ({ capability, className = '' }) => {
  if (!capability) return null;

  const depositList = capability.summary?.depositCapabilities || [];
  const withdrawList = capability.summary?.withdrawCapabilities || [];

  return (
    <div className={`rounded-xl p-3 bg-slate-900/60 border border-slate-800 text-xs space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          Supported Payment Rails
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          🟢 Available
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400 block mb-1">
            Deposit Methods
          </span>
          <div className="space-y-0.5">
            {depositList.slice(0, 3).map((method, idx) => (
              <div key={idx} className="flex items-center gap-1 text-slate-200 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate">{method}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400 block mb-1">
            Withdraw To
          </span>
          <div className="space-y-0.5">
            {withdrawList.slice(0, 3).map((method, idx) => (
              <div key={idx} className="flex items-center gap-1 text-slate-200 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{method}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
