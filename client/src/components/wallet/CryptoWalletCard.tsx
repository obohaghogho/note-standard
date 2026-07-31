import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, ArrowUpRight, Send, ArrowRightLeft, ShoppingCart, DollarSign,
  Lock, Info, ChevronRight, ShieldAlert
} from 'lucide-react';
import type { CryptoCurrencyConfig } from '../../config/currencyConfig';

interface CryptoWalletCardProps {
  currency: CryptoCurrencyConfig;
  balance: number;
  availableBalance: number;
  address?: string;
  network?: string;
  usdValue?: number;
  ngnValue?: number;
  showBalance: boolean;
  isSelected?: boolean;
  isExpanded?: boolean;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onSend?: () => void;
  onSwap?: () => void;
  onBuyWithFiat?: () => void;
  onSellToFiat?: () => void;
  onSelect?: () => void;
  onToggleExpand?: () => void;
}

export function CryptoWalletCard({
  currency,
  balance,
  availableBalance,
  address,
  network,
  usdValue = 0,
  ngnValue = 0,
  showBalance,
  isSelected = false,
  isExpanded = false,
  onDeposit,
  onWithdraw,
  onSend,
  onSwap,
  onBuyWithFiat,
  onSellToFiat,
  onSelect,
  onToggleExpand,
}: CryptoWalletCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isCustodyComingSoon = currency.custodyStatus === 'coming_soon' || currency.status === 'coming_soon';

  const formatBalance = (val: number) => {
    if (!showBalance) return '••••••';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: Math.min(currency.decimal_places, 6),
      maximumFractionDigits: Math.min(currency.decimal_places, 6),
    });
  };

  const primaryActions = [
    { label: 'Deposit', icon: Download, enabled: !isCustodyComingSoon && currency.deposit_enabled, onClick: onDeposit, color: 'text-emerald-400' },
    { label: 'Withdraw', icon: ArrowUpRight, enabled: !isCustodyComingSoon && currency.withdraw_enabled, onClick: onWithdraw, color: 'text-amber-400' },
    { label: 'Send', icon: Send, enabled: !isCustodyComingSoon, onClick: onSend, color: 'text-blue-400' },
    { label: 'Swap', icon: ArrowRightLeft, enabled: !isCustodyComingSoon && currency.swap_enabled, onClick: onSwap, color: 'text-purple-400' },
  ];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!isCustodyComingSoon ? { y: -2 } : {}}
      transition={{ duration: 0.25 }}
      onMouseEnter={() => isCustodyComingSoon && setShowTooltip(true)}
      onMouseLeave={() => isCustodyComingSoon && setShowTooltip(false)}
      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        isSelected
          ? 'border-purple-500/50 bg-gradient-to-br from-purple-900/30 to-gray-900'
          : 'border-white/5 bg-gradient-to-br from-gray-900 via-gray-900/90 to-gray-950 hover:border-white/10'
      }`}
    >
      {/* Color accent glow */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${currency.color}, transparent)` }}
      />

      {/* Tooltip on Hover for Crypto Custody */}
      <AnimatePresence>
        {isCustodyComingSoon && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-gray-900/95 border border-amber-500/40 text-amber-300 text-xs font-medium shadow-xl pointer-events-none whitespace-nowrap flex items-center gap-1.5"
          >
            <Info size={13} className="text-amber-400 shrink-0" />
            <span>Custody Integration Coming Soon until production custody is enabled.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-5">
        {/* Header */}
        <div
          className="flex items-start justify-between cursor-pointer"
          onClick={() => { onSelect?.(); onToggleExpand?.(); }}
        >
          <div className="flex items-center gap-3">
            {/* Currency icon circle */}
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-black shadow-lg border"
              style={{
                background: `${currency.color}20`,
                borderColor: `${currency.color}30`,
                color: currency.color,
              }}
            >
              {currency.symbol}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-base">{currency.code}</span>
                <span className="text-xs text-gray-400 font-normal">({currency.name})</span>
                
                {/* Custody Integration Badge */}
                {isCustodyComingSoon ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <Lock size={10} className="text-amber-400" />
                    Custody Integration Coming Soon
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    ACTIVE
                  </span>
                )}
              </div>

              {/* Supported Networks */}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-gray-500 text-[10px]">Networks:</span>
                {currency.networks?.map(net => (
                  <span key={net} className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/5 text-gray-400 border border-white/5">
                    {net}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-bold text-white tracking-tight">
                {currency.symbol}{formatBalance(balance)}
              </div>
              <div className="text-xs text-gray-500">
                ${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <ChevronRight
              size={18}
              className={`transition-transform text-gray-600 ${isExpanded ? 'rotate-90 text-purple-400' : ''}`}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            {primaryActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  disabled={!action.enabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!action.enabled) return;
                    action.onClick?.();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    action.enabled
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

          {isCustodyComingSoon && (
            <div className="text-[11px] text-amber-400/90 flex items-center gap-1">
              <ShieldAlert size={12} />
              <span>Custody integration in progress</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
