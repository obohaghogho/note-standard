import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, ArrowUpRight, Send, RefreshCw, ShoppingCart, Lock, Info, ChevronRight, CheckCircle2, AlertCircle
} from 'lucide-react';
import type { CurrencyConfig } from '../../config/currencyConfig';
import { useWalletCapabilities } from '../../hooks/useWalletCapabilities';
import { WalletRailSummary } from './WalletRailSummary';

interface FiatWalletCardProps {
  currency: CurrencyConfig;
  balance: number;
  availableBalance: number;
  pendingBalance?: number;
  showBalance: boolean;
  isSelected?: boolean;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onTransfer?: () => void;
  onConvert?: () => void;
  onBuyCrypto?: () => void;
  onSelect?: () => void;
}

function ComingSoonModal({ currency, onClose }: { currency: CurrencyConfig; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(6, 6, 17, 0.85)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-gray-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle bg glow */}
          <div
            className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${currency.color}, transparent)` }}
          />

          <div className="text-5xl mb-4">{currency.flag}</div>
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-amber-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-3">
            <span>COMING SOON</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{currency.name} ({currency.code})</h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {currency.tooltip || "Available after banking partner activation."}
          </p>

          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 mb-6 text-left">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-indigo-300 text-xs leading-relaxed">
                Direct collection, deposit, and payout features for {currency.code} are currently being activated with our banking partners. Your wallet slot is reserved and will unlock automatically.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-600/25"
          >
            Got it
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function FiatWalletCard({
  currency,
  balance,
  availableBalance,
  pendingBalance = 0,
  showBalance,
  isSelected = false,
  onDeposit,
  onWithdraw,
  onTransfer,
  onConvert,
  onBuyCrypto,
  onSelect,
}: FiatWalletCardProps) {
  const { getCurrencyCapability } = useWalletCapabilities();
  const capability = getCurrencyCapability(currency.code);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const isActive = currency.status === 'active';
  const isComingSoon = currency.status === 'coming_soon';

  const formatBalance = (val: number) => {
    if (!showBalance) return '••••••';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: currency.decimal_places,
      maximumFractionDigits: currency.decimal_places,
    });
  };

  const actions = [
    { label: 'Deposit', icon: Download, enabled: currency.deposit_enabled, onClick: onDeposit, color: 'text-emerald-400' },
    { label: 'Withdraw', icon: ArrowUpRight, enabled: currency.withdraw_enabled, onClick: onWithdraw, color: 'text-orange-400' },
    { label: 'Send', icon: Send, enabled: currency.transfer_enabled, onClick: onTransfer, color: 'text-blue-400' },
    { label: 'Convert', icon: RefreshCw, enabled: currency.convert_enabled, onClick: onConvert, color: 'text-purple-400' },
  ];

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={isActive ? { y: -3, scale: 1.01 } : {}}
        transition={{ duration: 0.25 }}
        onMouseEnter={() => isComingSoon && setShowTooltip(true)}
        onMouseLeave={() => isComingSoon && setShowTooltip(false)}
        onClick={() => {
          if (isComingSoon) { setShowComingSoon(true); return; }
          onSelect?.();
        }}
        className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
          isActive
            ? isSelected
              ? 'border-indigo-500/60 bg-gradient-to-br from-indigo-900/40 via-gray-900 to-gray-900 shadow-xl shadow-indigo-950/40 cursor-pointer'
              : 'border-white/10 bg-gradient-to-br from-gray-900 via-gray-900/90 to-gray-950 hover:border-indigo-500/40 cursor-pointer'
            : 'border-white/5 bg-gray-950/60 opacity-60 cursor-not-allowed'
        }`}
        style={{ minHeight: 180 }}
      >
        {/* Glow accent */}
        {isActive && (
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${currency.color}, transparent)` }}
          />
        )}

        {/* Tooltip on Hover for Coming Soon */}
        <AnimatePresence>
          {isComingSoon && showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-gray-900/95 border border-amber-500/40 text-amber-300 text-xs font-medium shadow-xl pointer-events-none whitespace-nowrap flex items-center gap-1.5"
            >
              <Info size={13} className="text-amber-400 shrink-0" />
              <span>{currency.tooltip || "Available after banking partner activation."}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-5 flex flex-col justify-between h-full">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-md border ${
                    isActive ? '' : 'grayscale opacity-70'
                  }`}
                  style={{
                    background: isActive ? `${currency.color}20` : 'rgba(255,255,255,0.05)',
                    borderColor: isActive ? `${currency.color}35` : 'rgba(255,255,255,0.08)',
                  }}
                >
                  {currency.flag}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-base ${isActive ? 'text-white' : 'text-gray-400'}`}>
                      {currency.code}
                    </span>
                    {/* Status Badge */}
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <Lock size={10} className="text-amber-400" />
                        COMING SOON
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-gray-400 text-xs">{currency.name}</span>
                    {currency.provider && (
                      <span className="text-gray-500 text-[10px] bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                        {currency.provider}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isActive && (
                <ChevronRight
                  size={18}
                  className={`transition-transform ${isSelected ? 'rotate-90 text-indigo-400' : 'text-gray-600'}`}
                />
              )}
            </div>

            {/* Features & Notices Pills */}
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {currency.features?.slice(0, 4).map((feat, idx) => (
                <span
                  key={idx}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                      : 'bg-white/5 text-gray-500 border border-white/5'
                  }`}
                >
                  {feat}
                </span>
              ))}
              {currency.notice && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                  <AlertCircle size={10} />
                  {currency.notice}
                </span>
              )}
            </div>

            {/* Provider-Aware Payment Rail Summary Badge */}
            {isActive && capability && (
              <WalletRailSummary capability={capability} className="mb-3" />
            )}

            {/* 3-Tier Settlement-Aware Balance Section */}
            <div className="mb-4 space-y-1">
              <div className="flex items-baseline justify-between">
                <div className={`text-2xl sm:text-3xl font-black tracking-tight ${isActive ? 'text-white' : 'text-gray-400'}`}>
                  {currency.symbol}{formatBalance(balance)}
                </div>
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Total</span>
              </div>

              <div className="pt-2 border-t border-white/5 space-y-1 text-xs">
                {/* Available */}
                <div className="flex justify-between items-center text-emerald-400 font-medium">
                  <span className="flex items-center gap-1 text-gray-400">
                    Available
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </span>
                  <span className="font-semibold">{currency.symbol}{formatBalance(availableBalance)}</span>
                </div>

                {/* Pending */}
                {pendingBalance > 0 && (
                  <div className="flex justify-between items-center text-amber-400 font-medium">
                    <span className="flex items-center gap-1 text-amber-400/90" title="Funds received, awaiting banking partner settlement">
                      <Clock size={11} className="text-amber-400" />
                      Pending Settlement
                    </span>
                    <span className="font-semibold">+{currency.symbol}{formatBalance(pendingBalance)}</span>
                  </div>
                )}

                {/* Reserved */}
                {Math.max(0, balance - availableBalance - pendingBalance) > 0 && (
                  <div className="flex justify-between items-center text-orange-400 font-medium">
                    <span className="flex items-center gap-1 text-orange-400/90" title="Funds reserved for an active withdrawal request">
                      <Lock size={11} className="text-orange-400" />
                      Reserved (Payout)
                    </span>
                    <span className="font-semibold">{currency.symbol}{formatBalance(Math.max(0, balance - availableBalance - pendingBalance))}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-white/5">
            <div className="flex gap-2 flex-wrap">
              {actions.map((action) => {
                const Icon = action.icon;
                let buttonEnabled = isActive && action.enabled;

                // Disable withdraw if available balance is zero/insufficient
                if (action.label === 'Withdraw' && availableBalance <= 0) {
                  buttonEnabled = false;
                }

                return (
                  <button
                    key={action.label}
                    disabled={!buttonEnabled}
                    title={action.label === 'Withdraw' && availableBalance <= 0 && isActive ? "Insufficient available balance to withdraw" : undefined}
                    onClick={(e) => {
                      if (!buttonEnabled) {
                        e.stopPropagation();
                        if (isComingSoon) setShowComingSoon(true);
                        return;
                      }
                      e.stopPropagation();
                      action.onClick?.();
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      buttonEnabled
                        ? `bg-white/5 hover:bg-white/10 border-white/10 ${action.color} hover:scale-105 active:scale-95 cursor-pointer`
                        : 'bg-white/5 border-white/5 text-gray-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Icon size={12} />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {showComingSoon && (
        <ComingSoonModal currency={currency} onClose={() => setShowComingSoon(false)} />
      )}
    </>
  );
}
