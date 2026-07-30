import React, { useState, useEffect } from 'react';
import axios from 'axios';

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

      if (custodyRes.data.success) {
        setCustodyBalances(custodyRes.data.custodyBalances || []);
        setUserLiabilities(custodyRes.data.userLiabilities || []);
        setReserveRatios(custodyRes.data.reserveRatios || []);
      }

      if (approvalsRes.data.success) {
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

  return (
    <div className="p-3 sm:p-6 w-full max-w-7xl mx-auto space-y-6 min-w-0 overflow-hidden">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-900 p-4 sm:p-6 rounded-xl border border-gray-800">
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
          className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow transition flex items-center gap-2 shrink-0"
        >
          {syncing ? 'Syncing...' : '🔄 Trigger Custody Sync'}
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 sm:p-4 bg-blue-950 border border-blue-800 text-blue-200 text-xs sm:text-sm rounded-lg break-words">
          {actionMessage}
        </div>
      )}

      {/* Reserve Ratio Cards */}
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-gray-200 mb-3 sm:mb-4">Reserve Ratio Health Index</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {reserveRatios.map((r) => (
            <div key={r.currency} className="bg-gray-900 p-4 sm:p-5 rounded-xl border border-gray-800 min-w-0">
              <div className="flex justify-between items-center gap-2">
                <span className="text-base sm:text-lg font-bold text-white truncate">{r.currency}</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full shrink-0 ${
                  r.status === 'GREEN' ? 'bg-green-900 text-green-300' : (r.status === 'YELLOW' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300')
                }`}>
                  {r.reserveRatioPercent}% {r.status}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs sm:text-sm text-gray-400">
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
      <div className="bg-gray-900 p-4 sm:p-6 rounded-xl border border-gray-800">
        <h2 className="text-base sm:text-lg font-semibold text-white mb-4 flex items-center gap-2 flex-wrap">
          🔐 Multi-Signature Payout Approval Queue ({pendingApprovals.length})
        </h2>
        {pendingApprovals.length === 0 ? (
          <p className="text-gray-500 text-xs sm:text-sm">No pending payout approvals. High-value withdrawal queue is clear.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-left text-xs sm:text-sm text-gray-300 min-w-[550px]">
              <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] sm:text-xs">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">User</th>
                  <th className="py-2.5 px-3 sm:px-4">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">Network</th>
                  <th className="py-2.5 px-3 sm:px-4">Approvals</th>
                  <th className="py-2.5 px-3 sm:px-4">Requested At</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pendingApprovals.map((app) => (
                  <tr key={app.id}>
                    <td className="py-3 px-3 sm:px-4 font-mono text-xs truncate max-w-[120px]">{app.user_email || app.user_id}</td>
                    <td className="py-3 px-3 sm:px-4 font-bold text-white whitespace-nowrap">{app.amount} {app.currency}</td>
                    <td className="py-3 px-3 sm:px-4 whitespace-nowrap">{app.network || 'NATIVE'}</td>
                    <td className="py-3 px-3 sm:px-4 font-mono whitespace-nowrap">{app.approvals_count} / {app.required_approvals}</td>
                    <td className="py-3 px-3 sm:px-4 text-xs text-gray-500 whitespace-nowrap">{new Date(app.created_at).toLocaleString()}</td>
                    <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleApprovalAction(app.id, 'APPROVED')}
                          className="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 text-xs rounded font-semibold transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleApprovalAction(app.id, 'REJECTED')}
                          className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-xs rounded font-semibold transition"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provider Custody Balances Table */}
      <div className="bg-gray-900 p-4 sm:p-6 rounded-xl border border-gray-800">
        <h2 className="text-base sm:text-lg font-semibold text-white mb-4">Provider Settlement Balances</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-left text-xs sm:text-sm text-gray-300 min-w-[500px]">
            <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] sm:text-xs">
              <tr>
                <th className="py-2.5 px-3 sm:px-4">Provider</th>
                <th className="py-2.5 px-3 sm:px-4">Currency</th>
                <th className="py-2.5 px-3 sm:px-4">Available</th>
                <th className="py-2.5 px-3 sm:px-4">Pending</th>
                <th className="py-2.5 px-3 sm:px-4">Last Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {custodyBalances.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 px-3 sm:px-4 font-bold text-white whitespace-nowrap">{b.provider_name || b.provider_id}</td>
                  <td className="py-3 px-3 sm:px-4 font-mono whitespace-nowrap">{b.currency}</td>
                  <td className="py-3 px-3 sm:px-4 font-mono text-green-400 whitespace-nowrap">{b.available}</td>
                  <td className="py-3 px-3 sm:px-4 font-mono text-yellow-400 whitespace-nowrap">{b.pending}</td>
                  <td className="py-3 px-3 sm:px-4 text-xs text-gray-500 whitespace-nowrap">{new Date(b.last_synced_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CryptoTreasuryDashboard;
