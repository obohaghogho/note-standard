import React, { useState } from 'react';
import { CreditCard, Globe, AlertTriangle, ShieldCheck, ExternalLink, ChevronRight, X, Sparkles } from 'lucide-react';

interface CardLimitNoticeProps {
  currentTier: number;
  dailyLimitUsd: number;
  remainingAllowanceUsd: number;
  currency: string;
  onUpgradeKyc?: () => void;
  onRequestLimitIncrease?: () => void;
  onClose?: () => void;
}

export const CardLimitNotice: React.FC<CardLimitNoticeProps> = ({
  currentTier,
  dailyLimitUsd,
  remainingAllowanceUsd,
  currency,
  onUpgradeKyc,
  onRequestLimitIncrease,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'domestic' | 'international'>('domestic');

  const isNgn = currency === 'NGN';
  const localLimitFormatted = isNgn
    ? `₦${(dailyLimitUsd * 1500).toLocaleString()}`
    : `$${dailyLimitUsd.toLocaleString()}`;

  return (
    <div className="bg-[#121824]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white shadow-2xl space-y-4 max-w-lg w-full relative overflow-hidden">
      {/* Background Accent Glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Card Limit Advisory
              <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Tier {currentTier}
              </span>
            </h3>
            <p className="text-xs text-gray-400">Understand platform KYC vs. bank card limits</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tab Switcher: Domestic vs International */}
      <div className="grid grid-cols-2 bg-white/5 p-1 rounded-xl border border-white/5 text-xs font-medium">
        <button
          onClick={() => setActiveTab('domestic')}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
            activeTab === 'domestic'
              ? 'bg-emerald-500 text-black font-semibold shadow-lg shadow-emerald-500/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Domestic Cards (NGN)
        </button>
        <button
          onClick={() => setActiveTab('international')}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
            activeTab === 'international'
              ? 'bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          International (USD/EUR)
        </button>
      </div>

      {/* Dynamic Tab Content */}
      {activeTab === 'domestic' ? (
        <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-3.5 text-xs text-gray-300">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/5">
            <span className="text-gray-400">NoteStandard Daily KYC Allowance:</span>
            <span className="font-bold text-emerald-400">{localLimitFormatted}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Typical Nigerian Bank Web Pay Limit:</span>
            <span className="font-semibold text-amber-300">₦200,000 – ₦500,000 / day</span>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              If your bank card declines a deposit higher than ₦200,000, open your bank mobile app under <strong>Card Control</strong> to increase Web Pay limits.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-3.5 text-xs text-gray-300">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/5">
            <span className="text-gray-400">International Card Daily Allowance:</span>
            <span className="font-bold text-blue-400">${dailyLimitUsd.toLocaleString()} USD</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Security Standard:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 3D-Secure 2.0 (3DS2) Required
            </span>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-blue-200">
            <Globe className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p>
              Foreign cards (Visa, Mastercard, AMEX in USD/EUR/GBP) require international cross-border permissions enabled by your foreign bank.
            </p>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {currentTier < 3 && onUpgradeKyc && (
          <button
            onClick={onUpgradeKyc}
            className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Upgrade Tier (Next Tier)
          </button>
        )}
        {onRequestLimitIncrease && (
          <button
            onClick={onRequestLimitIncrease}
            className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
          >
            Request Limit Increase
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
