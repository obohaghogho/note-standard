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
} from 'lucide-react';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────

interface PlatformWallet {
  id: string;
  currency: string;
  chain: string | null;
  description: string;
  balance: number;
  available: number;
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
  created_at: string;
}

interface Commission {
  id: string;
  amount: number;
  currency: string;
  rate_applied: number;
  commission_type: string;
  created_at: string;
}

interface DashboardData {
  range: string;
  generatedAt: string;
  summary: {
    totalTransactionsWithFee: number;
    avgFeeNGN: string;
    feesByCurrency: Record<string, number>;
    commissionsByCurrency: Record<string, number>;
  };
  feesByType: Record<string, number>;
  revenueByType: RevenueByType[];
  platformWallets: PlatformWallet[];
  recentFeeTransactions: FeeTx[];
  recentCommissions: Commission[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', EUR: '€', GBP: '£', BTC: '₿', ETH: 'Ξ',
};
const sym = (cur: string) => CURRENCY_SYMBOLS[cur.toUpperCase()] || cur + ' ';

const fmtAmt = (amount: number, currency: string) => {
  const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC'].includes(currency.toUpperCase());
  return `${sym(currency)}${amount.toLocaleString(undefined, { minimumFractionDigits: isCrypto ? 6 : 2, maximumFractionDigits: isCrypto ? 8 : 2 })}`;
};

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ComponentType<{ size: number; className?: string }>;
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
    transition: 'border-color 0.2s',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: '12px',
      background: `${iconColor}18`,
      border: `1px solid ${iconColor}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <Icon size={20} className={`text-[${iconColor}]`} style={{ color: iconColor }} />
    </div>
    <div>
      <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</p>
      <p style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 800, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>{sub}</p>}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const FeeRevenueDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30d');

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
  const ngnFees = s?.feesByCurrency?.NGN ?? 0;
  const usdFees = s?.feesByCurrency?.USD ?? 0;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #020617 0%, #0f172a 50%, #0a0f1e 100%)',
      color: '#f1f5f9',
      padding: '32px 24px',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={22} style={{ color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, background: 'linear-gradient(90deg, #e2e8f0, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              Fee &amp; Settlement Revenue
            </h1>
          </div>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            All platform fees collected from withdrawals, swaps, and deposits · Source: <code style={{ color: '#6366f1', fontSize: '11px' }}>transactions.fee + commissions + revenue_logs</code>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            id="fee-revenue-range"
            value={range}
            onChange={e => setRange(e.target.value)}
            style={{
              background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#e2e8f0', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer'
            }}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <button
            id="fee-revenue-refresh"
            onClick={fetchData}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 600
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#475569' }}>
          <RefreshCw size={32} style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite', display: 'block' }} />
          <p>Loading fee revenue data...</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <StatCard
              icon={Receipt}
              iconColor="#6366f1"
              label="Total NGN Fees Collected"
              value={fmtAmt(ngnFees, 'NGN')}
              sub={`${s?.totalTransactionsWithFee ?? 0} fee-bearing transactions`}
            />
            <StatCard
              icon={TrendingUp}
              iconColor="#10b981"
              label="Total USD Fees Collected"
              value={fmtAmt(usdFees, 'USD')}
              sub={`Avg NGN fee: ${fmtAmt(parseFloat(s?.avgFeeNGN || '0'), 'NGN')}`}
            />
            <StatCard
              icon={BarChart3}
              iconColor="#f59e0b"
              label="Fee-Bearing Transactions"
              value={String(s?.totalTransactionsWithFee ?? 0)}
              sub={`Range: ${range}`}
            />
            <StatCard
              icon={Coins}
              iconColor="#8b5cf6"
              label="Platform Wallets"
              value={String(data.platformWallets.length)}
              sub={data.platformWallets.length === 0 ? 'None configured yet' : 'Fee collection destinations'}
            />
          </div>

          {/* Platform Wallets */}
          {data.platformWallets.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={16} style={{ color: '#6366f1' }} /> Platform Fee Wallets (Where Fees Are Credited)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {data.platformWallets.map(pw => (
                  <div key={pw.id} style={{
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
                    border: `1px solid ${pw.hasLinkedWallet ? 'rgba(99,102,241,0.25)' : 'rgba(100,116,139,0.2)'}`,
                    borderRadius: '14px', padding: '18px 20px',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.3)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
                          {pw.currency} {pw.chain ? `(${pw.chain})` : ''}
                        </p>
                        <p style={{ fontSize: '13px', color: '#cbd5e1' }}>{pw.description}</p>
                      </div>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px',
                        background: pw.hasLinkedWallet ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: pw.hasLinkedWallet ? '#10b981' : '#ef4444',
                        border: `1px solid ${pw.hasLinkedWallet ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}>
                        {pw.hasLinkedWallet ? '● LINKED' : '● UNLINKED'}
                      </span>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(100,116,139,0.2)', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>Total Balance</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 700, fontFamily: 'monospace', fontSize: '14px' }}>{fmtAmt(pw.balance, pw.currency)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>Available</span>
                        <span style={{ color: '#10b981', fontWeight: 600, fontFamily: 'monospace', fontSize: '13px' }}>{fmtAmt(pw.available, pw.currency)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Fees by Transaction Type */}
          {Object.keys(data.feesByType).length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowDownCircle size={16} style={{ color: '#f59e0b' }} /> Fees Collected by Transaction Type
              </h2>
              <div style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
                border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                      {['Transaction Type', 'Total Fees (All Currencies)'].map(h => (
                        <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.feesByType).map(([type, total]) => (
                      <tr key={type} style={{ borderBottom: '1px solid rgba(100,116,139,0.1)' }}>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, fontFamily: 'monospace' }}>{type}</span>
                        </td>
                        <td style={{ padding: '12px 20px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 700 }}>
                          {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Revenue by Type */}
          {data.revenueByType.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: '#10b981' }} /> Revenue Log Breakdown
              </h2>
              <div style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
                border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(16,185,129,0.06)', borderBottom: '1px solid rgba(16,185,129,0.15)' }}>
                      {['Revenue Type', 'Currency', 'Count', 'Total'].map(h => (
                        <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenueByType.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(100,116,139,0.1)' }}>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>{r.type || 'UNKNOWN'}</span>
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
            {data.recentFeeTransactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#475569', background: 'rgba(15,23,42,0.5)', borderRadius: '16px', border: '1px solid rgba(100,116,139,0.2)' }}>
                <AlertCircle size={28} style={{ margin: '0 auto 8px', display: 'block', color: '#475569' }} />
                <p>No fee-bearing transactions found in the selected time range.</p>
              </div>
            ) : (
              <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                      {['Reference', 'Type', 'Amount', 'Fee Collected', 'Currency', 'Status', 'Date'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentFeeTransactions.map(tx => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid rgba(100,116,139,0.08)' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#6366f1' }}>
                          {tx.reference_id ? tx.reference_id.slice(0, 14) + '…' : tx.id.slice(0, 8) + '…'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, fontFamily: 'monospace' }}>{tx.type}</span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '13px' }}>{fmtAmt(parseFloat(String(tx.amount)) || 0, tx.currency)}</td>
                        <td style={{ padding: '10px 16px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}>{fmtAmt(parseFloat(String(tx.fee)) || 0, tx.currency)}</td>
                        <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '13px' }}>{tx.currency}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                            background: tx.status?.toUpperCase().includes('COMPLET') ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                            color: tx.status?.toUpperCase().includes('COMPLET') ? '#10b981' : '#f59e0b',
                          }}>
                            {tx.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtDate(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent Commissions Log */}
          {data.recentCommissions.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} style={{ color: '#f59e0b' }} /> Commissions Audit Log (Last 20)
              </h2>
              <div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '16px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                      {['Commission Amount', 'Currency', 'Type', 'Rate Applied', 'Date'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentCommissions.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(100,116,139,0.08)' }}>
                        <td style={{ padding: '10px 16px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}>{fmtAmt(parseFloat(String(c.amount)) || 0, c.currency)}</td>
                        <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '13px' }}>{c.currency}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600 }}>{c.commission_type || 'FIXED'}</span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: '12px' }}>
                          {c.rate_applied != null ? `${(parseFloat(String(c.rate_applied)) * 100).toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Footer */}
          <p style={{ textAlign: 'center', color: '#334155', fontSize: '11px', marginTop: '32px' }}>
            Data generated at {data.generatedAt ? fmtDate(data.generatedAt) : '—'} · Range: {range} · Source: <code style={{ color: '#6366f1' }}>transactions, commissions, revenue_logs, platform_wallets</code>
          </p>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default FeeRevenueDashboard;
