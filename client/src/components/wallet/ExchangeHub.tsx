import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, ShoppingCart, DollarSign, ArrowRightLeft,
  ArrowRight, Loader2, CheckCircle, AlertCircle, ChevronDown, Zap
} from 'lucide-react';
import { walletApi } from '../../api/walletApi';
import toast from 'react-hot-toast';

type ExchangeMode = 'convert' | 'buy' | 'sell' | 'swap';

interface WalletInfo {
  currency: string;
  symbol: string;
  balance: number;
  flag?: string;
  color?: string;
}

interface ExchangeHubProps {
  fiatWallets: WalletInfo[];
  cryptoWallets: WalletInfo[];
  rates: Record<string, number>;
  onSuccess?: () => void;
  lastUsedFiatCurrency?: string;
}

const MODES: { id: ExchangeMode; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { id: 'convert', label: 'Convert Fiat', icon: RefreshCw, description: 'Between fiat currencies', color: '#3b82f6' },
  { id: 'buy', label: 'Buy Crypto', icon: ShoppingCart, description: 'Fiat → Crypto', color: '#10b981' },
  { id: 'sell', label: 'Sell Crypto', icon: DollarSign, description: 'Crypto → Fiat', color: '#f97316' },
  { id: 'swap', label: 'Swap Crypto', icon: ArrowRightLeft, description: 'Crypto → Crypto', color: '#8b5cf6' },
];

const QUICK_PAIRS: Array<{ from: string; to: string; label: string }> = [
  { from: 'NGN', to: 'BTC', label: 'NGN → BTC' },
  { from: 'BTC', to: 'NGN', label: 'BTC → NGN' },
  { from: 'ETH', to: 'USD', label: 'ETH → USD' },
  { from: 'NGN', to: 'USDT', label: 'NGN → USDT' },
  { from: 'BTC', to: 'USDT', label: 'BTC → USDT' },
  { from: 'ETH', to: 'BTC', label: 'ETH → BTC' },
];

const CRYPTO_SYMBOLS: Record<string, string> = { BTC: '₿', ETH: 'Ξ', USDT: '₮', USDC: '🔵' };
const FIAT_SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£' };
const ALL_SYMBOLS = { ...FIAT_SYMBOLS, ...CRYPTO_SYMBOLS };

function CurrencySelector({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Array<{ code: string; label: string; balance?: number; symbol?: string }>;
  onChange: (val: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.code === value);

  return (
    <div className="relative">
      <label className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/8 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{selected?.symbol || ALL_SYMBOLS[value] || '◎'}</span>
          <div className="text-left">
            <div className="font-bold text-white text-sm">{value}</div>
            {selected?.balance !== undefined && (
              <div className="text-gray-500 text-xs">Bal: {selected.balance.toFixed(4)}</div>
            )}
          </div>
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute z-30 top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            {options.map(opt => (
              <button
                key={opt.code}
                onClick={() => { onChange(opt.code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${opt.code === value ? 'bg-indigo-500/10' : ''}`}
              >
                <span className="text-base">{opt.symbol || ALL_SYMBOLS[opt.code] || '◎'}</span>
                <div className="flex-1">
                  <div className="font-semibold text-white text-sm">{opt.code}</div>
                  <div className="text-gray-500 text-xs">{opt.label}</div>
                </div>
                {opt.balance !== undefined && (
                  <span className="text-gray-400 text-xs">{opt.balance.toFixed(4)}</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ExchangeHub({
  fiatWallets,
  cryptoWallets,
  rates,
  onSuccess,
  lastUsedFiatCurrency = 'NGN',
}: ExchangeHubProps) {
  const [mode, setMode] = useState<ExchangeMode>('buy');
  const [fromCurrency, setFromCurrency] = useState('NGN');
  const [toCurrency, setToCurrency] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');

  // Set smart defaults per mode
  useEffect(() => {
    setQuote(null);
    setError('');
    setAmount('');
    if (mode === 'buy') {
      // Smart default: prefer last used fiat, else highest-balance fiat
      const lastUsed = fiatWallets.find(w => w.currency === lastUsedFiatCurrency && w.balance > 0);
      const highestFiat = [...fiatWallets].sort((a, b) => b.balance - a.balance)[0];
      setFromCurrency((lastUsed || highestFiat)?.currency || 'NGN');
      setToCurrency('BTC');
    } else if (mode === 'sell') {
      setFromCurrency('BTC');
      setToCurrency(fiatWallets.find(w => w.currency === 'NGN')?.currency || fiatWallets[0]?.currency || 'NGN');
    } else if (mode === 'swap') {
      setFromCurrency('BTC');
      setToCurrency('ETH');
    } else if (mode === 'convert') {
      setFromCurrency('NGN');
      setToCurrency('USD');
    }
  }, [mode]);

  const computedRate = (() => {
    if (!rates[fromCurrency] || !rates[toCurrency]) return null;
    return rates[fromCurrency] / rates[toCurrency];
  })();

  const estimatedOutput = computedRate && amount ? (parseFloat(amount) * computedRate) : null;

  const fiatOptions = fiatWallets
    .filter(w => w.currency)
    .map(w => ({ code: w.currency, label: w.currency, balance: w.balance, symbol: FIAT_SYMBOLS[w.currency] }));

  const cryptoOptions = cryptoWallets
    .filter(w => w.currency)
    .map(w => ({ code: w.currency, label: w.currency, balance: w.balance, symbol: CRYPTO_SYMBOLS[w.currency] }));

  const fromOptions = mode === 'sell' || mode === 'swap' ? cryptoOptions : fiatOptions;
  const toOptions = mode === 'buy' || mode === 'swap' ? cryptoOptions : (mode === 'sell' ? fiatOptions : fiatOptions);

  const getQuote = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    setError('');
    setQuoteLoading(true);
    try {
      const res = await walletApi.previewSwapHub({ fromCurrency, toCurrency, amount: parseFloat(amount) });
      setQuote(res);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Could not fetch quote. Please try again.');
    } finally {
      setQuoteLoading(false);
    }
  };

  const executeExchange = async () => {
    if (!quote) return;
    setExecuting(true);
    try {
      const idempotencyKey = `hub_${mode}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      await walletApi.executeSwapHub({ lockId: quote.lockId || quote.id, idempotencyKey });
      toast.success(`${mode === 'buy' ? 'Purchase' : mode === 'sell' ? 'Sale' : mode === 'convert' ? 'Conversion' : 'Swap'} completed!`);
      setQuote(null);
      setAmount('');

      // Remember last used fiat currency for Buy mode
      if (mode === 'buy') {
        localStorage.setItem('lastBuyCryptoCurrency', fromCurrency);
      }
      onSuccess?.();
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Exchange failed. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setExecuting(false);
    }
  };

  const handleQuickPair = (pair: { from: string; to: string }) => {
    const newMode: ExchangeMode =
      FIAT_SYMBOLS[pair.from] && CRYPTO_SYMBOLS[pair.to] ? 'buy' :
      CRYPTO_SYMBOLS[pair.from] && FIAT_SYMBOLS[pair.to] ? 'sell' :
      CRYPTO_SYMBOLS[pair.from] && CRYPTO_SYMBOLS[pair.to] ? 'swap' : 'convert';
    setMode(newMode);
    setFromCurrency(pair.from);
    setToCurrency(pair.to);
    setQuote(null);
    setAmount('');
  };

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-200 ${
                isActive
                  ? 'border-transparent text-white shadow-lg'
                  : 'border-white/5 bg-white/3 text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
              style={isActive ? { background: `${m.color}20`, borderColor: `${m.color}40`, boxShadow: `0 4px 24px ${m.color}20` } : {}}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: isActive ? `${m.color}30` : 'rgba(255,255,255,0.05)' }}
              >
                <Icon size={17} style={{ color: isActive ? m.color : undefined }} />
              </div>
              <div>
                <div className="font-semibold text-xs">{m.label}</div>
                <div className={`text-xs transition-opacity ${isActive ? 'opacity-70' : 'opacity-0'}`} style={{ color: m.color }}>
                  {m.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick pair chips */}
      <div>
        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider flex items-center gap-1">
          <Zap size={11} /> Quick Convert
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {QUICK_PAIRS.map((pair) => (
            <button
              key={pair.label}
              onClick={() => handleQuickPair(pair)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/5 transition-all hover:scale-105 active:scale-95"
            >
              {pair.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange form */}
      <div className="bg-white/3 border border-white/5 rounded-2xl p-5 space-y-4">
        {/* From */}
        <CurrencySelector
          value={fromCurrency}
          options={fromOptions}
          onChange={(v) => { setFromCurrency(v); setQuote(null); }}
          label="From"
        />

        {/* Amount */}
        <div>
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 block">Amount</label>
          <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
            <span className="text-gray-400 font-bold">{ALL_SYMBOLS[fromCurrency] || ''}</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setQuote(null); setError(''); }}
              placeholder="0.00"
              className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-gray-700"
            />
          </div>
          {/* Live rate preview */}
          {computedRate && amount && parseFloat(amount) > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
              <span className="text-gray-600">≈</span>
              <span className="font-semibold text-gray-300">
                {estimatedOutput?.toLocaleString('en-US', { maximumFractionDigits: 8 })} {toCurrency}
              </span>
              <span className="text-gray-600 ml-1">
                (1 {fromCurrency} = {computedRate.toLocaleString('en-US', { maximumFractionDigits: 8 })} {toCurrency})
              </span>
            </div>
          )}
        </div>

        {/* Arrow divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/5" />
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <ArrowRight size={14} className="text-gray-400" />
          </div>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* To */}
        <CurrencySelector
          value={toCurrency}
          options={toOptions.filter(o => o.code !== fromCurrency)}
          onChange={(v) => { setToCurrency(v); setQuote(null); }}
          label="To"
        />

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-xs">{error}</p>
          </div>
        )}

        {/* Quote preview */}
        {quote && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-2"
          >
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">You send</span>
              <span className="font-bold text-white">{quote.from_amount} {fromCurrency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">You receive</span>
              <span className="font-bold text-emerald-400">{Number(quote.to_amount).toFixed(8)} {toCurrency}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Rate</span>
              <span className="text-gray-400">1 {fromCurrency} = {Number(quote.rate).toFixed(8)} {toCurrency}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Fee</span>
              <span className="text-gray-400">{Number(quote.fee || 0).toFixed(4)} {fromCurrency}</span>
            </div>
            {quote.expires_at && (
              <div className="text-xs text-yellow-400 text-center pt-1">
                ⏱ Quote valid for 2 minutes
              </div>
            )}
          </motion.div>
        )}

        {/* CTA buttons */}
        {!quote ? (
          <button
            onClick={getQuote}
            disabled={quoteLoading || !amount}
            className="w-full py-4 rounded-2xl font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            {quoteLoading ? <Loader2 size={18} className="animate-spin" /> : null}
            {quoteLoading ? 'Getting quote...' : 'Get Quote'}
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setQuote(null)}
              className="flex-1 py-3 rounded-2xl font-semibold text-gray-400 bg-white/5 hover:bg-white/10 transition-all border border-white/5"
            >
              Cancel
            </button>
            <button
              onClick={executeExchange}
              disabled={executing}
              className="flex-[2] py-3 rounded-2xl font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {executing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              {executing ? 'Processing...' : 'Confirm Exchange'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
