import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ResponsiveTableWrapper from '../../components/common/ResponsiveTableWrapper';
import TruncatedId from '../../components/common/TruncatedId';

interface CustodyBalance {
  id: string;
  provider_id: string;
  provider_name?: string;
  currency: string;
  available: string;
  locked: string;
  pending: string;
  last_synced_at: string;
}

interface UserLiability {
  currency: string;
  total_liability: string;
  wallet_count: number;
}

interface ReserveRatio {
  currency: string;
  userLiability: string;
  custodyAsset: string;
  reserveRatioPercent: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
}

interface PendingApproval {
  id: string;
  user_id: string;
  user_email?: string;
  currency: string;
  amount: string;
  network?: string;
  status: string;
  required_approvals: number;
  approvals_count: number;
  created_at: string;
}

export const CryptoTreasuryDashboard: React.FC = () => {
  const [custodyBalances, setCustodyBalances] = useState<CustodyBalance[]>([]);
  const [userLiabilities, setUserLiabilities] = useState<UserLiability[]>([]);
  const [reserveRatios, setReserveRatios] = useState<ReserveRatio[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [custodyRes, approvalsRes] = await Promise.all([
        axios.get('/api/admin/crypto/custody', { headers }),
        axios.get('/api/admin/crypto/approvals', { headers })
      ]);

      if (custodyRes.data?.success) {
        setCustodyBalances(custodyRes.data.custodyBalances || []);
        setUserLiabilities(custodyRes.data.userLiabilities || []);
        setReserveRatios(custodyRes.data.reserveRatios || []);
      }

      if (approvalsRes.data?.success) {
        setPendingApprovals(approvalsRes.data.pendingApprovals || []);
      }
    } catch (err: any) {
      console.error("Failed to fetch treasury dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      const token = localStorage.getItem('token');
      await axios.post('/api/admin/crypto/sync', {}, { headers: { Authorization: `Bearer ${token}` } });
      setActionMessage("Manual custody sync completed successfully!");
      fetchDashboardData();
    } catch (err: any) {
      setActionMessage("Custody sync failed: " + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleApprovalAction = async (transactionId: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/admin/crypto/approvals/action',
        { transactionId, action, reason: `Admin ${action.toLowerCase()} via Treasury Dashboard` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActionMessage(`Transaction ${transactionId} ${action.toLowerCase()}!`);
      fetchDashboardData();
    } catch (err: any) {
      setActionMessage("Approval action failed: " + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading Crypto Treasury & Reserve Metrics...</div>;
  }

  const approvalHeaders = [
    { key: 'user', label: 'User' },
    { key: 'amount', label: 'Amount' },
    { key: 'network', label: 'Network' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'requested', label: 'Requested At' },
    { key: 'actions', label: 'Actions' }
  ];

  const balanceHeaders = [
    { key: 'provider', label: 'Provider' },
    { key: 'currency', label: 'Currency' },
    { key: 'available', label: 'Available' },
    { key: 'pending', label: 'Pending' },
    { key: 'synced', label: 'Last Synced' }
  ];

  return (
    <div className="p-2 sm:p-4 w-full max-w-7xl mx-auto space-y-6 min-w-0">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-900/80 p-4 sm:p-6 rounded-xl border border-gray-800">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
            🏦 Crypto Treasury & Settlement Hub
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            Real-time custody reserve ratios, user liabilities, multi-provider balances, and payout approval queue.
          </p>
        </div>
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow transition flex items-center justify-center gap-2 shrink-0 min-h-[44px]"
        >
          {syncing ? 'Syncing...' : '🔄 Trigger Custody Sync'}
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 sm:p-4 bg-indigo-950/80 border border-indigo-800 text-indigo-200 text-xs sm:text-sm rounded-xl break-words">
          {actionMessage}
        </div>
      )}

      {/* Reserve Ratio Cards */}
      <div>
        <h2 className="text-base sm:text-lg font-bold text-gray-200 mb-3 sm:mb-4">Reserve Ratio Health Index</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {reserveRatios.map((r) => (
            <div key={r.currency} className="bg-gray-900/80 p-4 sm:p-5 rounded-xl border border-gray-800 min-w-0 space-y-3">
              <div className="flex justify-between items-center gap-2">
                <span className="text-base sm:text-lg font-bold text-white truncate">{r.currency}</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full shrink-0 ${
                  r.status === 'GREEN' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : (r.status === 'YELLOW' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30')
                }`}>
                  {r.reserveRatioPercent}% {r.status}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex justify-between items-center gap-2">
                  <span className="shrink-0">Custody Asset:</span>
                  <span className="text-white font-mono truncate">{r.custodyAsset} {r.currency}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="shrink-0">User Liabilities:</span>
                  <span className="text-white font-mono truncate">{r.userLiability} {r.currency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-Sig Approval Queue */}
      <div className="bg-gray-900/60 p-4 sm:p-6 rounded-xl border border-gray-800 space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
          🔐 Multi-Signature Payout Approval Queue ({pendingApprovals.length})
        </h2>
        <ResponsiveTableWrapper
          headers={approvalHeaders}
          data={pendingApprovals}
          loading={false}
          emptyTitle="Queue Clear"
          emptyDescription="No pending payout approvals. High-value withdrawal queue is clear."
          keyExtractor={(app) => app.id}
          renderRow={(app) => (
            <tr key={app.id} className="hover:bg-white/5 transition-colors">
              <td className="py-3 px-4 text-xs font-mono text-gray-300"><TruncatedId id={app.user_email || app.user_id} /></td>
              <td className="py-3 px-4 text-xs font-bold text-white">{app.amount} {app.currency}</td>
              <td className="py-3 px-4 text-xs text-gray-300">{app.network || 'NATIVE'}</td>
              <td className="py-3 px-4 text-xs font-mono text-indigo-300">{app.approvals_count} / {app.required_approvals}</td>
              <td className="py-3 px-4 text-xs text-gray-400">{new Date(app.created_at).toLocaleString()}</td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleApprovalAction(app.id, 'APPROVED')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-semibold transition shadow min-h-[36px]"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleApprovalAction(app.id, 'REJECTED')}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg font-semibold transition shadow min-h-[36px]"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          )}
          renderCard={(app) => (
            <div className="p-4 rounded-xl bg-gray-900/90 border border-gray-800 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <span className="text-sm font-bold text-white">{app.amount} {app.currency}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/20 text-indigo-300">{app.approvals_count}/{app.required_approvals} approvals</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 block">User:</span>
                  <TruncatedId id={app.user_email || app.user_id} startChars={6} endChars={6} />
                </div>
                <div>
                  <span className="text-gray-500 block">Network:</span>
                  <span className="text-gray-200 font-medium">{app.network || 'NATIVE'}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={() => handleApprovalAction(app.id, 'APPROVED')}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow min-h-[44px]"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleApprovalAction(app.id, 'REJECTED')}
                  className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow min-h-[44px]"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {/* Provider Custody Balances Table */}
      <div className="bg-gray-900/60 p-4 sm:p-6 rounded-xl border border-gray-800 space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-white">Provider Settlement Balances</h2>
        <ResponsiveTableWrapper
          headers={balanceHeaders}
          data={custodyBalances}
          loading={false}
          emptyTitle="No Provider Balances"
          emptyDescription="Custody balances will appear here once synchronized."
          keyExtractor={(b) => b.id}
          renderRow={(b) => (
            <tr key={b.id} className="hover:bg-white/5 transition-colors">
              <td className="py-3 px-4 text-xs font-bold text-white">{b.provider_name || b.provider_id}</td>
              <td className="py-3 px-4 text-xs font-mono text-indigo-300">{b.currency}</td>
              <td className="py-3 px-4 text-xs font-mono text-emerald-400 font-bold">{b.available}</td>
              <td className="py-3 px-4 text-xs font-mono text-amber-300">{b.pending}</td>
              <td className="py-3 px-4 text-xs text-gray-400">{new Date(b.last_synced_at).toLocaleString()}</td>
            </tr>
          )}
          renderCard={(b) => (
            <div className="p-4 rounded-xl bg-gray-900/90 border border-gray-800 space-y-2 shadow-lg text-xs">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="font-bold text-white text-sm">{b.provider_name || b.provider_id}</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold">{b.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Available:</span>
                <span className="font-mono text-emerald-400 font-bold">{b.available}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pending:</span>
                <span className="font-mono text-amber-300">{b.pending}</span>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
};

export default CryptoTreasuryDashboard;

