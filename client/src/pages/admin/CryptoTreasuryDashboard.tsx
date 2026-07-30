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
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header & Controls */}
      <div className="flex justify-between items-center bg-gray-900 p-6 rounded-xl border border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            🏦 Crypto Treasury & Settlement Hub
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Real-time custody reserve ratios, user liabilities, multi-provider balances, and payout approval queue.
          </p>
        </div>
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium shadow transition flex items-center gap-2"
        >
          {syncing ? 'Syncing...' : '🔄 Trigger Custody Sync'}
        </button>
      </div>

      {actionMessage && (
        <div className="p-4 bg-blue-950 border border-blue-800 text-blue-200 rounded-lg">
          {actionMessage}
        </div>
      )}

      {/* Reserve Ratio Cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Reserve Ratio Health Index</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {reserveRatios.map((r) => (
            <div key={r.currency} className="bg-gray-900 p-5 rounded-xl border border-gray-800">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-white">{r.currency}</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                  r.status === 'GREEN' ? 'bg-green-900 text-green-300' : (r.status === 'YELLOW' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300')
                }`}>
                  {r.reserveRatioPercent}% {r.status}
                </span>
              </div>
              <div className="mt-4 space-y-1 text-sm text-gray-400">
                <div className="flex justify-between">
                  <span>Custody Asset:</span>
                  <span className="text-white font-mono">{r.custodyAsset} {r.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>User Liabilities:</span>
                  <span className="text-white font-mono">{r.userLiability} {r.currency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-Sig Approval Queue */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          🔐 Multi-Signature Payout Approval Queue ({pendingApprovals.length})
        </h2>
        {pendingApprovals.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending payout approvals. High-value withdrawal queue is clear.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Network</th>
                  <th className="py-3 px-4">Approvals</th>
                  <th className="py-3 px-4">Requested At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pendingApprovals.map((app) => (
                  <tr key={app.id}>
                    <td className="py-3 px-4 font-mono text-xs">{app.user_email || app.user_id}</td>
                    <td className="py-3 px-4 font-bold text-white">{app.amount} {app.currency}</td>
                    <td className="py-3 px-4">{app.network || 'NATIVE'}</td>
                    <td className="py-3 px-4 font-mono">{app.approvals_count} / {app.required_approvals}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{new Date(app.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleApprovalAction(app.id, 'APPROVED')}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-xs rounded font-semibold"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleApprovalAction(app.id, 'REJECTED')}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs rounded font-semibold"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provider Custody Balances Table */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Provider Settlement Balances</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
              <tr>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4">Currency</th>
                <th className="py-3 px-4">Available</th>
                <th className="py-3 px-4">Pending</th>
                <th className="py-3 px-4">Last Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {custodyBalances.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 px-4 font-bold text-white">{b.provider_name || b.provider_id}</td>
                  <td className="py-3 px-4 font-mono">{b.currency}</td>
                  <td className="py-3 px-4 font-mono text-green-400">{b.available}</td>
                  <td className="py-3 px-4 font-mono text-yellow-400">{b.pending}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{new Date(b.last_synced_at).toLocaleString()}</td>
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
