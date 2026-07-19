import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, ArrowUpRight, Send, RefreshCw, ShoppingCart, Lock, Info, X, ChevronRight
} from 'lucide-react';

interface CurrencyCapabilities {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  transfer_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  convert_enabled: boolean;
  decimal_places: number;
  deposit_methods?: string[];
}

interface FiatWalletCardProps {
  currency: CurrencyCapabilities;
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

function ComingSoonModal({ currency, onClose }: { currency: CurrencyCapabilities; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-gray-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-5xl mb-4">{currency.flag}</div>
          <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">International Wallet</h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {currency.name} ({currency.code}) international deposits and payments will be available soon.
            Your wallet will automatically become active once this feature is enabled.
          </p>
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 mb-6 text-left">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-indigo-300 text-xs leading-relaxed">
                We've requested international payment support from Paystack. Your {currency.code} wallet 
                address is already reserved and ready to activate. No action needed on your part.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
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
  const [showComingSoon, setShowComingSoon] = useState(false);
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
    { label: 'Buy Crypto', icon: ShoppingCart, enabled: currency.buy_enabled, onClick: onBuyCrypto, color: 'text-pink-400' },
  ];

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={isActive ? { y: -2 } : {}}
        transition={{ duration: 0.3 }}
        onClick={() => {
          if (isComingSoon) { setShowComingSoon(true); return; }
          onSelect?.();
        }}
        className={`relative overflow-hidden rounded-2xl border transition-all duration-200 cursor-pointer ${
          isSelected && isActive
            ? 'border-indigo-500/50 bg-gradient-to-br from-indigo-900/30 to-gray-900'
            : 'border-white/5 bg-gradient-to-br from-gray-900 to-gray-900/80 hover:border-white/10'
        }`}
        style={{ minHeight: 160 }}
      >
        {/* Glow accent */}
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${currency.color}, transparent)` }}
        />

        {/* Coming Soon Glassmorphism Overlay */}
        {isComingSoon && (
          <div className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center gap-2"
            style={{
              background: 'rgba(6,6,17,0.7)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-gray-800 border border-white/10 flex items-center justify-center">
              <Lock size={18} className="text-gray-400" />
            </div>
            <span className="text-sm font-bold text-gray-300">Coming Soon</span>
            <div className="flex items-center gap-1 text-xs text-indigo-400">
              <Info size={11} />
              <span>Tap for details</span>
            </div>
          </div>
        )}

        <div className={`p-5 ${isComingSoon ? 'opacity-30' : ''}`}>
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg"
                style={{ background: `${currency.color}20`, border: `1px solid ${currency.color}30` }}
              >
                {currency.flag}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{currency.code}</span>
                  {isActive && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">Active</span>
                  )}
                </div>
                <span className="text-gray-500 text-xs">{currency.name}</span>
              </div>
            </div>
            {isActive && (
              <ChevronRight size={16} className={`transition-transform ${isSelected ? 'rotate-90 text-indigo-400' : 'text-gray-600'}`} />
            )}
          </div>

          {/* Balance */}
          <div className="mb-4">
            <div className="text-2xl font-black text-white tracking-tight">
              {currency.symbol}{formatBalance(balance)}
            </div>
            {pendingBalance > 0 && (
              <div className="text-xs text-yellow-400 mt-0.5">
                +{currency.symbol}{formatBalance(pendingBalance)} pending
              </div>
            )}
            <div className="text-gray-500 text-xs mt-0.5">
              Available: {currency.symbol}{formatBalance(availableBalance)}
            </div>
          </div>

          {/* Action buttons */}
          {isActive && (
            <div className="flex gap-2 flex-wrap">
              {actions.filter(a => a.enabled).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs font-semibold ${action.color} hover:scale-105 active:scale-95`}
                  >
                    <Icon size={12} />
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {showComingSoon && (
        <ComingSoonModal currency={currency} onClose={() => setShowComingSoon(false)} />
      )}
    </>
  );
}
