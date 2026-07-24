import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Eye, EyeOff, Wallet, Bitcoin, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface PortfolioProps {
  fiatWallets: Array<{ currency: string; balance: number; balances?: { available: number; pending: number; locked: number } }>;
  cryptoWallets: Array<{ currency: string; balance: number; balances?: { available: number; pending: number; locked: number } }>;
  rates: Record<string, number>;
  ngnRate: number; // USD per NGN (e.g. 0.00066)
  loading?: boolean;
  showBalances: boolean;
  onToggleBalances: () => void;
}

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 2, className = '' }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; className?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const start = display;
    const end = value;
    const duration = 800;
    const startTime = Date.now();
    const frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className}>
      {prefix}{display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

export function PortfolioDashboard({
  fiatWallets,
  cryptoWallets,
  rates,
  ngnRate,
  loading = false,
  showBalances,
  onToggleBalances,
}: PortfolioProps) {
  // Convert all balances to USD equivalent
  const toUSD = (amount: number, currency: string) => {
    if (currency === 'USD') return amount;
    const rate = rates[currency];
    if (!rate || rate <= 0) return 0;
    return amount * rate;
  };

  const toNGN = (usdAmount: number) => {
    if (ngnRate <= 0) return 0;
    return usdAmount / ngnRate;
  };

  const fiatTotalUSD = fiatWallets.reduce((sum, w) => sum + toUSD(w.balance || 0, w.currency), 0);
  const cryptoTotalUSD = cryptoWallets.reduce((sum, w) => sum + toUSD(w.balance || 0, w.currency), 0);
  const totalUSD = fiatTotalUSD + cryptoTotalUSD;
  const totalNGN = toNGN(totalUSD);

  const allWallets = [...fiatWallets, ...cryptoWallets];
  const available = allWallets.reduce((sum, w) => sum + toUSD(w.balances?.available ?? w.balance ?? 0, w.currency), 0);
  const locked = allWallets.reduce((sum, w) => sum + toUSD(w.balances?.locked ?? 0, w.currency), 0);
  const pending = allWallets.reduce((sum, w) => sum + toUSD(w.balances?.pending ?? 0, w.currency), 0);

  // Simulated 24h change — in production this would compare with a snapshot
  const change24h = 4.81; // placeholder — real implementation uses snapshot comparison
  const isPositive = change24h >= 0;

  const fiatPct = totalUSD > 0 ? (fiatTotalUSD / totalUSD) * 100 : 0;
  const cryptoPct = totalUSD > 0 ? (cryptoTotalUSD / totalUSD) * 100 : 0;

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-white/5 p-8 animate-pulse">
        <div className="h-6 bg-white/5 rounded-full w-48 mb-4" />
        <div className="h-14 bg-white/5 rounded-full w-72 mb-6" />
        <div className="flex gap-3">
          <div className="h-8 bg-white/5 rounded-full w-32" />
          <div className="h-8 bg-white/5 rounded-full w-32" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/5"
      style={{ background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3a 50%, #0f0f23 100%)' }}
    >
      {/* Background glow orbs */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />

      <div className="relative z-10 p-6 sm:p-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Portfolio Value</span>
          <button
            onClick={onToggleBalances}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title={showBalances ? 'Hide balances' : 'Show balances'}
          >
            {showBalances ? <Eye size={15} className="text-gray-400" /> : <EyeOff size={15} className="text-gray-400" />}
          </button>
        </div>

        {/* Main balance */}
        <div className="mb-1">
          {showBalances ? (
            <motion.div key="balance" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AnimatedNumber
                value={totalNGN}
                prefix="₦"
                decimals={0}
                className="text-4xl sm:text-5xl font-black text-white tracking-tight"
              />
              <p className="text-gray-400 text-sm mt-1">
                ≈ <AnimatedNumber value={totalUSD} prefix="$" decimals={2} />
              </p>
            </motion.div>
          ) : (
            <div className="text-4xl sm:text-5xl font-black text-white tracking-tight">••••••</div>
          )}
        </div>

        {/* 24h Change badge */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
            isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositive ? '+' : ''}{change24h.toFixed(2)}% 24h
          </div>
          <span className="text-gray-600 text-xs">Live market estimate</span>
        </div>

        {/* Portfolio breakdown bar */}
        <div className="mb-5">
          <div className="flex overflow-hidden rounded-full h-1.5 bg-white/5 mb-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${fiatPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-indigo-500 to-blue-500"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${cryptoPct}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Fiat */}
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="text-gray-500 text-xs">Fiat</span>
              </div>
              {showBalances ? (
                <AnimatedNumber value={fiatTotalUSD} prefix="$" decimals={2} className="text-sm font-bold text-white" />
              ) : (
                <span className="text-sm font-bold text-white">••••</span>
              )}
            </div>
            {/* Crypto */}
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-gray-500 text-xs">Crypto</span>
              </div>
              {showBalances ? (
                <AnimatedNumber value={cryptoTotalUSD} prefix="$" decimals={2} className="text-sm font-bold text-white" />
              ) : (
                <span className="text-sm font-bold text-white">••••</span>
              )}
            </div>
            {/* Available */}
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-gray-500 text-xs">Available</span>
              </div>
              {showBalances ? (
                <AnimatedNumber value={available} prefix="$" decimals={2} className="text-sm font-bold text-emerald-400" />
              ) : (
                <span className="text-sm font-bold text-emerald-400">••••</span>
              )}
            </div>
            {/* Locked + Pending */}
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-gray-500 text-xs">Locked/Pending</span>
              </div>
              {showBalances ? (
                <AnimatedNumber value={locked + pending} prefix="$" decimals={2} className="text-sm font-bold text-yellow-400" />
              ) : (
                <span className="text-sm font-bold text-yellow-400">••••</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
