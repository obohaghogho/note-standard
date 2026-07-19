import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, DollarSign, ShoppingCart, ChevronDown } from 'lucide-react';
import walletApi from '../../api/walletApi';

interface ActivityItem {
  id: string;
  amount: number;
  currency: string;
  type: string;
  activity_type?: string;
  status: string;
  reference?: string;
  created_at: string;
}

interface RecentActivityProps {
  refreshKey?: number;
  limit?: number;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  DEPOSIT:            { icon: ArrowDownLeft, label: 'Deposited', color: '#10b981', bgColor: '#10b98115' },
  CREDIT:             { icon: ArrowDownLeft, label: 'Received', color: '#10b981', bgColor: '#10b98115' },
  WITHDRAWAL:         { icon: ArrowUpRight,  label: 'Withdrew', color: '#f59e0b', bgColor: '#f59e0b15' },
  DEBIT:              { icon: ArrowUpRight,  label: 'Sent', color: '#ef4444', bgColor: '#ef444415' },
  SWAP:               { icon: ArrowRightLeft, label: 'Swapped', color: '#8b5cf6', bgColor: '#8b5cf615' },
  TRANSFER:           { icon: ArrowRightLeft, label: 'Transferred', color: '#3b82f6', bgColor: '#3b82f615' },
  INTERNAL_TRANSFER:  { icon: ArrowRightLeft, label: 'Converted', color: '#6366f1', bgColor: '#6366f115' },
  'Digital Assets Purchase': { icon: ShoppingCart, label: 'Bought', color: '#ec4899', bgColor: '#ec489915' },
  SELL:               { icon: DollarSign, label: 'Sold', color: '#f97316', bgColor: '#f9731615' },
  BACKSTOP:           { icon: DollarSign, label: 'System', color: '#6b7280', bgColor: '#6b728015' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG[type?.toUpperCase()] || {
    icon: Clock,
    label: type?.replace(/_/g, ' ') || 'Transaction',
    color: '#6b7280',
    bgColor: '#6b728015',
  };
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAmount(amount: number, currency: string): string {
  const SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', BTC: '₿', ETH: 'Ξ', USDT: '₮', USDC: '' };
  const symbol = SYMBOLS[currency] || '';
  const absAmt = Math.abs(amount);
  const decimals = ['BTC', 'ETH'].includes(currency) ? 6 : 2;
  return `${symbol}${absAmt.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function RecentActivity({ refreshKey = 0, limit = 20 }: RecentActivityProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 10;

  const loadActivity = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const currentPage = reset ? 1 : page;
      const res = await walletApi.getLedger(PAGE_SIZE);
      const entries: ActivityItem[] = res?.entries || [];
      if (reset) {
        setItems(entries);
        setPage(1);
      } else {
        setItems(prev => [...prev, ...entries]);
      }
      setHasMore(entries.length === PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadActivity(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (loading && items.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 bg-white/3 rounded-2xl border border-white/5 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-white/5 rounded-full w-32" />
              <div className="h-2 bg-white/5 rounded-full w-20" />
            </div>
            <div className="h-4 bg-white/5 rounded-full w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
          <Clock size={22} className="text-gray-600" />
        </div>
        <p className="text-gray-500 text-sm">No transactions yet</p>
        <p className="text-gray-600 text-xs mt-1">Your activity will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <AnimatePresence mode="popLayout">
        {items.slice(0, limit).map((item, i) => {
          const config = getTypeConfig(item.activity_type || item.type);
          const Icon = config.icon;
          const isCredit = item.amount > 0;
          const amountColor = isCredit ? '#10b981' : '#ef4444';

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 transition-colors group"
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: config.bgColor }}
              >
                <Icon size={16} style={{ color: config.color }} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white truncate">{config.label}</span>
                  <span className="text-gray-500 text-sm">{item.currency}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    item.status === 'SETTLED' || item.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : item.status === 'PENDING'
                      ? 'bg-yellow-500/10 text-yellow-400'
                      : 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {item.status}
                  </span>
                  <span className="text-gray-600 text-xs">{formatTimeAgo(item.created_at)}</span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right shrink-0">
                <div className="font-bold text-sm" style={{ color: amountColor }}>
                  {isCredit ? '+' : '-'}{formatAmount(item.amount, item.currency)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {hasMore && (
        <button
          onClick={() => { setPage(p => p + 1); loadActivity(); }}
          disabled={loading}
          className="w-full py-3 text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2 rounded-2xl border border-white/5 hover:bg-white/5"
        >
          {loading ? 'Loading...' : (
            <><ChevronDown size={14} /> Load more</>
          )}
        </button>
      )}
    </div>
  );
}
