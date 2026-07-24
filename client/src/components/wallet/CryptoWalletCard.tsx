import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download, ArrowUpRight, Send, ArrowRightLeft, ShoppingCart, DollarSign,
  QrCode, Copy, Check, ChevronDown, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CryptoCurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  swap_enabled: boolean;
  decimal_places: number;
  networks?: string[];
}

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
  const [copied, setCopied] = useState(false);

  const formatBalance = (val: number) => {
    if (!showBalance) return '••••••';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: Math.min(currency.decimal_places, 6),
      maximumFractionDigits: Math.min(currency.decimal_places, 6),
    });
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const primaryActions = [
    { label: 'Deposit', icon: Download, enabled: currency.deposit_enabled, onClick: onDeposit, color: '#10b981' },
    { label: 'Withdraw', icon: ArrowUpRight, enabled: currency.withdraw_enabled, onClick: onWithdraw, color: '#f59e0b' },
    { label: 'Send', icon: Send, enabled: true, onClick: onSend, color: '#3b82f6' },
    { label: 'Swap', icon: ArrowRightLeft, enabled: currency.swap_enabled, onClick: onSwap, color: '#8b5cf6' },
  ];

  const secondaryActions = [
    { label: 'Buy with Fiat', icon: ShoppingCart, enabled: currency.buy_enabled, onClick: onBuyWithFiat, color: '#ec4899' },
    { label: 'Sell to Fiat', icon: DollarSign, enabled: currency.sell_enabled, onClick: onSellToFiat, color: '#f97316' },
  ];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        isSelected
          ? 'border-purple-500/40 bg-gradient-to-br from-purple-900/20 to-gray-900'
          : 'border-white/5 bg-gradient-to-br from-gray-900 to-gray-900/80 hover:border-white/10'
      }`}
    >
      {/* Color accent glow */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${currency.color}, transparent)` }}
      />

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
                <span className="font-bold text-white">{currency.code}</span>
                {/* Network badges */}
                {currency.networks?.slice(0, 2).map(net => (
                  <span key={net} className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-400 border border-white/5">
                    {net}
                  </span>
                ))}
                {(currency.networks?.length ?? 0) > 2 && (
                  <span className="text-gray-500 text-xs">+{(currency.networks?.length ?? 0) - 2}</span>
                )}
              </div>
              <span className="text-gray-500 text-xs">{currency.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="font-black text-white text-base">
                {showBalance ? formatBalance(balance) : '••••'}
              </div>
              <div className="text-gray-500 text-xs">
                {showBalance ? `≈ $${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••'}
              </div>
            </div>
            <ChevronDown
              size={16}
              className={`text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {/* Expanded content */}
        <motion.div
          initial={false}
          animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="pt-4 space-y-4">
            {/* Deposit address */}
            {address && (
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 font-medium">Deposit Address</span>
                  {network && (
                    <span className="text-xs text-purple-400 font-medium">{network}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-300 font-mono truncate flex-1">
                    {address}
                  </code>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopyAddress(); }}
                    className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-gray-400" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeposit?.(); }}
                    className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <QrCode size={14} className="text-gray-400" />
                  </button>
                </div>
              </div>
            )}

            {/* NGN value */}
            {ngnValue > 0 && showBalance && (
              <div className="text-xs text-gray-500">
                ≈ ₦{ngnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN
              </div>
            )}

            {/* Primary actions */}
            <div className="grid grid-cols-4 gap-2">
              {primaryActions.filter(a => a.enabled).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all hover:scale-105 active:scale-95 group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${action.color}15` }}
                    >
                      <Icon size={15} style={{ color: action.color }} />
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-white font-medium transition-colors">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Secondary actions */}
            <div className="flex gap-2">
              {secondaryActions.filter(a => a.enabled).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all text-sm font-semibold hover:scale-[1.02] active:scale-95"
                    style={{ color: action.color }}
                  >
                    <Icon size={14} />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
