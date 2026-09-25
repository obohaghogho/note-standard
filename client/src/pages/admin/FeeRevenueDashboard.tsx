import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  Wallet,
  RefreshCw,
  Receipt,
  ArrowDownCircle,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Coins,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  X
} from 'lucide-react';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────

interface PlatformWallet {
  id: string;
  currency: string;
  chain: string | null;
  description: string;
  balance: number;      // Total Revenue Balance
  available: number;    // Available for Settlement
  settled: number;      // Settled Revenue
  hasLinkedWallet: boolean;
}

interface RevenueByType {
  type: string;
  currency: string;
  total: number;
  count: number;
}

interface FeeTx {
  id: string;
  type: string;
  amount: number;
  fee: number;
  currency: string;
  status: string;
  reference_id: string;
  provider?: string;
  created_at: string;
}

interface DashboardData {
  range: string;
  generatedAt: string;
  summary: {
    totalTransactionsWithFee: number;
    avgFeeNGN: string;
    feesByCurrency: Record<string, number>;
    platformRevenueByCurrency: Record<string, number>;
  };
  feesByType: Record<string, number>;
  revenueByType: RevenueByType[];
  platformWallets: PlatformWallet[];
  recentFeeTransactions: FeeTx[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', GHS: 'GH₵', EUR: '€', GBP: '£', BTC: '₿', ETH: 'Ξ',
};
const sym = (cur: string) => CURRENCY_SYMBOLS[cur.toUpperCase()] || cur + ' ';

const fmtAmt = (amount: number, currency: string) => {
  const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC'].includes(currency.toUpperCase());
  return `${sym(currency)}${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: isCrypto ? 6 : 2, maximumFractionDigits: isCrypto ? 8 : 2 })}`;
};

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// ── Stat Card Component ───────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ComponentType<{ size: number; style?: React.CSSProperties }>;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, iconColor, label, value, sub }) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)',
    border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: '16px',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: '12px',
      background: `${iconColor}18`,
      border: `1px solid ${iconColor}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <Icon size={20} style={{ color: iconColor }} />
    </div>
    <div>
      <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</p>
      <p style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 800, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>{sub}</p>}
    </div>
  </div>
);

// ── Main Dashboard Component ──────────────────────────────────────────────────

const FeeRevenueDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');

  // Settlement Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleCurrency, setSettleCurrency] = useState('NGN');
  const [settleAmount, setSettleAmount] = useState('');
  const [settling, setSettling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/fee-revenue?range=${range}`);
      if (res.data?.success) {
        setData(res.data);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err: any) {
      console.error('[FeeRevenue] fetch error:', err);
      toast.error(err?.response?.data?.error || 'Failed to load fee revenue data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const s = data?.summary;
  const ngnPlatformRev = s?.platformRevenueByCurrency?.NGN ?? 0;
  const usdPlatformRev = s?.platformRevenueByCurrency?.USD ?? 0;
  const ghsPlatformRev = s?.platformRevenueByCurrency?.GHS ?? 0;
  const ngnCustFees = s?.feesByCurrency?.NGN ?? 0;

  // Selected currency available revenue for settlement
  const currentWallet = data?.platformWallets?.find(w => w.currency === settleCurrency);
  const maxAvailableSettle = currentWallet?.available || 0;

  const handleExecuteSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(settleAmount);

    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid settlement amount greater than 0');
      return;
    }

    if (amt > maxAvailableSettle) {
      toast.error(`Settlement amount exceeds available ${settleCurrency} revenue (${fmtAmt(maxAvailableSettle, settleCurrency)})`);
      return;
    }

    setSettling(true);
    try {
      const res = await api.post('/admin/fee-revenue/settle', {
        amount: amt,
        currency: settleCurrency,
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'Settlement request processed successfully!');
        setShowSettleModal(false);
        setSettleAmount('');
        fetchData(); // Refresh totals
      } else {
        throw new Error(res.data?.error || 'Settlement request failed');
      }
    } catch (err: any) {
      console.error('[FeeRevenue] settlement error:', err);
      toast.error(err?.response?.data?.error || err.message || 'Failed to process settlement');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #020617 0%, #0f172a 50%, #0a0f1e 100%)',
      color: '#f1f5f9',
      padding: '20px 16px',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      maxWidth: '100vw',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DollarSign size={22} style={{ color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, background: 'linear-gradient(90deg, #e2e8f0, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, wordBreak: 'break-word' }}>
              Fee &amp; Platform Revenue Settlement
            </h1>
          </div>
          <p style={{ color: '#64748b', fontSize: '12px', margin: 0, wordBreak: 'break-word' }}>
            Authoritative platform revenue collected across NGN, USD &amp; GHS · Source: <code style={{ color: '#6366f1', fontSize: '11px' }}>revenue_logs + transactions.fee</code>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', maxWidth: '100%' }}>
          <select
            id="fee-revenue-range"
            value={range}
            onChange={e => setRange(e.target.value)}
            style={{
              flex: '1 1 110px', minWidth: '100px',
              background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#e2e8f0', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer'
            }}
          >
            <option value="all">All Time</option>
            <option value="90d">Last 90 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
          </select>

          <button
            id="fee-revenue-refresh"
            onClick={fetchData}
            disabled={loading}
            style={{
              flex: '1 1 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>

          <button
            id="open-settlement-modal"
            onClick={() => setShowSettleModal(true)}
            style={{
              flex: '2 1 180px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none',
              color: '#fff', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 700,
              boxShadow: '0 4px 14px rgba(16,185,129,0.3)', whiteSpace: 'nowrap'
            }}
          >
            <Building2 size={15} />
            Settle Platform Revenue
          </button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569' }}>
          <RefreshCw size={32} style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite', display: 'block' }} />
          <p>Loading fee &amp; settlement revenue data...</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <StatCard
              icon={Receipt}
              iconColor="#6366f1"
              label="NGN Platform Revenue (4.5%)"
              value={fmtAmt(ngnPlatformRev, 'NGN')}
              sub={`Customer total fees: ${fmtAmt(ngnCustFees, 'NGN')}`}
            />
            <StatCard
              icon={TrendingUp}
              iconColor="#10b981"
              label="USD Platform Revenue (4.5%)"
              value={fmtAmt(usdPlatformRev, 'USD')}
              sub={`Operational scope: USD`}
            />
            <StatCard
              icon={Coins}
              iconColor="#f59e0b"
              label="GHS Platform Revenue (4.5%)"
              value={fmtAmt(ghsPlatformRev, 'GHS')}
              sub={`Operational scope: GHS`}
            />
            <StatCard
              icon={BarChart3}
              iconColor="#8b5cf6"
              label="Fee-Bearing Transactions"
              value={String(s?.totalTransactionsWithFee ?? 0)}
              sub={`Range: ${range}`}
            />
          </div>

          {/* Platform Revenue Accounts / Wallets */}
          <section style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={16} style={{ color: '#6366f1' }} /> Platform Revenue Accounts &amp; Settlement Balances
              </h2>
              <span style={{ fontSize: '11px', color: '#64748b', background: 'rgba(100,116,139,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
                Scope: NGN · USD · GHS
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {(data.platformWallets || []).map(pw => (
                <div key={pw.id} style={{
                  background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '16px', padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <span style={{
                        background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: '11px', fontWeight: 700,
                        padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase', fontFamily: 'monospace'
                      }}>
                        {pw.currency} PLATFORM ACCOUNT
                      </span>
                      <p style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '6px', marginBottom: 0 }}>{pw.description}</p>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px',
                      background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)'
                    }}>
                      ● ACTIVE
                    </span>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(100,116,139,0.15)', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#64748b', fontSize: '12px' }}>Total Earned Revenue</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 700, fontFamily: 'monospace', fontSize: '14px' }}>{fmtAmt(pw.balance, pw.currency)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#64748b', fontSize: '12px' }}>Available for Settlement</span>
                      <span style={{ color: '#10b981', fontWeight: 700, fontFamily: 'monospace', fontSize: '14px' }}>{fmtAmt(pw.available, pw.currency)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontSize: '12px' }}>Settled Revenue</span>
                      <span style={{ color: '#94a3b8', fontWeight: 600, fontFamily: 'monospace', fontSize: '13px' }}>{fmtAmt(pw.settled, pw.currency)}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(100,116,139,0.1)' }}>
                    <button
                      onClick={() => {
                        setSettleCurrency(pw.currency);
                        setSettleAmount(String(pw.available));
                        setShowSettleModal(true);
                      }}
                      disabled={pw.available <= 0}
                      style={{
                        width: '100%',
                        background: pw.available > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.1)',
                        border: `1px solid ${pw.available > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.2)'}`,
                        color: pw.available > 0 ? '#10b981' : '#64748b',
                        borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: pw.available > 0 ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      <ArrowUpRight size={14} /> Settle {pw.currency} Revenue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Revenue Log Breakdown */}
          {(data.revenueByType || []).length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: '#10b981' }} /> Revenue Category Breakdown (Admin Component)
              </h2>
              <div style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
                border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(16,185,129,0.06)', borderBottom: '1px solid rgba(16,185,129,0.15)' }}>
                      {['Revenue Type', 'Currency', 'Transaction Count', 'Platform Revenue (Admin)'].map(h => (
                        <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.revenueByType || []).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(100,116,139,0.1)' }}>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, fontFamily: 'monospace' }}>{r.type || 'UNKNOWN'}</span>
                        </td>
                        <td style={{ padding: '12px 20px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: '13px' }}>{r.currency}</td>
                        <td style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '13px' }}>{r.count}</td>
                        <td style={{ padding: '12px 20px', color: '#10b981', fontFamily: 'monospace', fontWeight: 700 }}>{fmtAmt(r.total, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Recent Fee Transactions */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} style={{ color: '#a5b4fc' }} /> Recent Fee-Bearing Transactions (Last 50)
            </h2>
            {(data.recentFeeTransactions || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#475569', background: 'rgba(15,23,42,0.5)', borderRadius: '16px', border: '1px solid rgba(100,116,139,0.2)' }}>
                <AlertCircle size={28} style={{ margin: '0 auto 8px', display: 'block', color: '#475569' }} />
                <p>No fee-bearing transactions found in the selected time range.</p>
              </div>
            ) : (
              <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                      {['Reference', 'Type', 'Gross Amount', 'Customer Fee (4.6%)', 'Currency', 'Provider', 'Status', 'Date'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recentFeeTransactions || []).map(tx => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid rgba(100,116,139,0.08)' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#6366f1' }}>
                          {tx.reference_id ? (tx.reference_id.length > 20 ? tx.reference_id.slice(0, 18) + '…' : tx.reference_id) : tx.id.slice(0, 8) + '…'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, fontFamily: 'monospace' }}>{tx.type}</span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '12px' }}>
                          {fmtAmt(tx.amount, tx.currency)}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#10b981', fontFamily: 'monospace', fontWeight: 700, fontSize: '12px' }}>
                          {fmtAmt(tx.fee, tx.currency)}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#cbd5e1', fontSize: '12px' }}>{tx.currency}</td>
                        <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>{tx.provider || 'internal'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            background: ['COMPLETED', 'SUCCESS'].includes((tx.status || '').toUpperCase()) ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                            color: ['COMPLETED', 'SUCCESS'].includes((tx.status || '').toUpperCase()) ? '#10b981' : '#f59e0b',
                            padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700
                          }}>
                            ● {tx.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>{fmtDate(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Controlled Revenue Settlement Modal */}
      {showSettleModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #0f172a, #1e293b)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '20px', width: '100%', maxWidth: '480px', padding: '28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)', color: '#f1f5f9'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Building2 size={20} style={{ color: '#10b981' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Settle Platform Revenue</h3>
              </div>
              <button onClick={() => setShowSettleModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleExecuteSettlement}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Select Operational Currency
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {['NGN', 'USD', 'GHS'].map(cur => (
                    <button
                      type="button"
                      key={cur}
                      onClick={() => {
                        setSettleCurrency(cur);
                        const w = data?.platformWallets?.find(x => x.currency === cur);
                        setSettleAmount(String(w?.available || '0'));
                      }}
                      style={{
                        padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                        background: settleCurrency === cur ? 'rgba(99,102,241,0.2)' : 'rgba(30,41,59,0.8)',
                        border: `1px solid ${settleCurrency === cur ? '#6366f1' : 'rgba(100,116,139,0.2)'}`,
                        color: settleCurrency === cur ? '#a5b4fc' : '#94a3b8', cursor: 'pointer'
                      }}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: '12px', padding: '14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Available {settleCurrency} Revenue:</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                  {fmtAmt(maxAvailableSettle, settleCurrency)}
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Settlement Amount ({settleCurrency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={maxAvailableSettle}
                  value={settleAmount}
                  onChange={e => setSettleAmount(e.target.value)}
                  placeholder={`Enter amount to settle (max ${maxAvailableSettle})`}
                  style={{
                    width: '100%', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(99,102,241,0.3)',
                    color: '#f1f5f9', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', fontFamily: 'monospace',
                    outline: 'none', boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div style={{
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: '12px', padding: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start'
              }}>
                <ShieldCheck size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ color: '#cbd5e1', fontSize: '11px', margin: 0, lineHeight: 1.4 }}>
                  <strong>Compliance Gate Active:</strong> Live Fincra payout execution is gated (<code>ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION=false</code>). Settlements record safely as <code>SIMULATED_TEST</code> until compliance confirmation.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  style={{
                    flex: 1, background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.3)',
                    color: '#94a3b8', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling || maxAvailableSettle <= 0}
                  style={{
                    flex: 1.5, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none',
                    color: '#fff', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: settling ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  {settling ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowUpRight size={16} />}
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default FeeRevenueDashboard;
