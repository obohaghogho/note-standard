import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Loader2, Search } from 'lucide-react';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';

interface UnmatchedWithdrawal {
  id: string;
  reference: string;
  fincra_reference?: string;
  user_id: string;
  amount: number;
  currency: string;
  provider_name?: string;
  withdrawal_status: string;
  funds_status: string;
  provider_status: string;
  manual_review_status: string;
  reconciliation_status: string;
  created_at: string;
  profile?: {
    email: string;
    full_name: string;
  };
}

export const AdminWithdrawalReconciliation: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<UnmatchedWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUnmatched = async () => {
    setLoading(true);
    try {
      const res = await walletApi.getUnmatchedWithdrawalsAdmin();
      if (res.success) {
        setWithdrawals(res.unmatched || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch unmatched withdrawals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnmatched();
  }, []);

  const handleReconcile = async (withdrawal: UnmatchedWithdrawal, targetAction: 'SETTLE' | 'REVERSE') => {
    const actionLabel = targetAction === 'SETTLE' ? 'Finalize Settlement (Debit Wallet)' : 'Reverse Reservation (Restore Balance)';
    if (!window.confirm(`${actionLabel} for withdrawal of ${withdrawal.currency} ${withdrawal.amount} (${withdrawal.reference})?`)) {
      return;
    }

    setReconcilingId(withdrawal.id);
    try {
      const res = await walletApi.reconcileWithdrawalAdmin({
        reference: withdrawal.reference,
        targetAction,
        reason: `Manual Admin ${targetAction} Action`,
      });

      if (res.success) {
        toast.success(`Withdrawal ${targetAction.toLowerCase()}d successfully`);
        fetchUnmatched();
      } else {
        toast.error(res.message || 'Reconciliation failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Reconciliation error');
    } finally {
      setReconcilingId(null);
    }
  };

  const filteredWithdrawals = withdrawals.filter((w) => {
    const query = searchQuery.toLowerCase();
    return (
      w.reference.toLowerCase().includes(query) ||
      (w.fincra_reference && w.fincra_reference.toLowerCase().includes(query)) ||
      w.user_id.toLowerCase().includes(query) ||
      (w.profile?.email && w.profile.email.toLowerCase().includes(query)) ||
      w.currency.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Universal Withdrawal Exception Queue</h1>
            <p className="text-slate-400 text-sm">
              Universal Multi-Currency Exception Management (NGN, USD, EUR, GBP, TZS, CAD)
            </p>
          </div>
        </div>
        <button
          onClick={fetchUnmatched}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Unresolved Exceptions</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{withdrawals.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Active Rails</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">Universal Multi-Currency</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Ledger Safety Model</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">Atomic Reservation</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search by reference, provider ref, user ID, or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Exception Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 flex justify-center items-center text-slate-400 space-x-3">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <span>Scanning withdrawal exception queue...</span>
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-lg font-medium text-white">No Unresolved Withdrawal Exceptions</p>
            <p className="text-sm mt-1">All withdrawal requests are fully reconciled across all active currencies.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4">Withdrawal Ref</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Amount & Currency</th>
                  <th className="p-4">State Matrix</th>
                  <th className="p-4">Exception Reason</th>
                  <th className="p-4 text-right">Reconciliation Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {filteredWithdrawals.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-4 font-mono text-xs text-amber-300">
                      <div>{tx.reference}</div>
                      {tx.fincra_reference && <div className="text-slate-500 text-[10px]">Prov: {tx.fincra_reference}</div>}
                    </td>
                    <td className="p-4">
                      <div className="text-white font-medium">{tx.profile?.full_name || 'Customer'}</div>
                      <div className="text-slate-400 text-xs">{tx.profile?.email || tx.user_id.substring(0, 8)}</div>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-semibold">
                        {tx.currency} {tx.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 space-y-1">
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-400">Withdrawal:</span>
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                          {tx.withdrawal_status || 'INITIATED'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-400">Funds:</span>
                        <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                          {tx.funds_status || 'RESERVED'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-400">Provider:</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          {tx.provider_status || 'PROCESSING'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center space-x-2 text-amber-400 font-medium text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{tx.reconciliation_status}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handleReconcile(tx, 'SETTLE')}
                        disabled={reconcilingId === tx.id}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 text-xs font-semibold transition-colors"
                      >
                        {reconcilingId === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Settle Debit</span>
                      </button>
                      <button
                        onClick={() => handleReconcile(tx, 'REVERSE')}
                        disabled={reconcilingId === tx.id}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/30 text-xs font-semibold transition-colors"
                      >
                        {reconcilingId === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>Release Funds</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminWithdrawalReconciliation;
