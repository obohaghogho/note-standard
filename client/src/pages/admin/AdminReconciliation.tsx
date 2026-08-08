import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2, Loader2, Search, ArrowRight, FileText } from 'lucide-react';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';

interface UnmatchedDeposit {
  id: string;
  reference_id: string;
  provider_reference: string;
  user_id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  payment_status: string;
  receipt_status: string;
  wallet_credit_status: string;
  reconciliation_status: string;
  created_at: string;
  metadata?: any;
}

export const AdminReconciliation: React.FC = () => {
  const [deposits, setDeposits] = useState<UnmatchedDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  const fetchUnmatched = async () => {
    setLoading(true);
    try {
      const res = await walletApi.getUnmatchedDepositsAdmin();
      if (res.success) {
        setDeposits(res.deposits || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch unmatched deposits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnmatched();
  }, []);

  const handleReconcile = async (deposit: UnmatchedDeposit) => {
    if (!window.confirm(`Reconcile payment of ${deposit.currency} ${deposit.amount} for reference ${deposit.reference_id}?`)) {
      return;
    }

    setReconcilingId(deposit.id);
    try {
      const res = await walletApi.reconcileDepositAdmin({
        transactionId: deposit.id,
        reference: deposit.reference_id,
        providerTransactionId: deposit.provider_reference || deposit.metadata?.fincra_reference,
        reason: 'Admin verified provider deposit receipt and authorized wallet credit',
      });

      if (res.success) {
        toast.success(res.message || 'Transaction reconciled & wallet credited successfully!');
        fetchUnmatched();
      } else {
        toast.error('Reconciliation failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Reconciliation failed');
    } finally {
      setReconcilingId(null);
    }
  };

  const filteredDeposits = deposits.filter((d) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      d.reference_id?.toLowerCase().includes(query) ||
      d.user_id?.toLowerCase().includes(query) ||
      d.provider_reference?.toLowerCase().includes(query);
    const matchesCurrency = currencyFilter === 'ALL' || d.currency?.toUpperCase() === currencyFilter;
    return matchesQuery && matchesCurrency;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-purple-400" size={24} />
            <h1 className="text-xl font-bold text-white tracking-wide">Admin Deposit Reconciliation Queue</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Review and manually reconcile unmatched successful bank deposits across all active currencies (NGN, USD, EUR, GBP, TZS, CAD, etc.).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUnmatched}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border border-gray-700"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Queue
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900/80 p-3 border border-gray-800 rounded-xl">
        <div className="flex items-center gap-2 bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-700">
          <span className="text-[10px] text-gray-400 font-bold uppercase">Currency:</span>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-gray-900">ALL CURRENCIES</option>
            <option value="NGN" className="bg-gray-900">NGN (₦)</option>
            <option value="USD" className="bg-gray-900">USD ($)</option>
            <option value="EUR" className="bg-gray-900">EUR (€)</option>
            <option value="GBP" className="bg-gray-900">GBP (£)</option>
            <option value="TZS" className="bg-gray-900">TZS</option>
            <option value="CAD" className="bg-gray-900">CAD ($)</option>
          </select>
        </div>

        <div className="flex-1 flex items-center gap-2 min-w-[240px]">
          <Search size={16} className="text-gray-400 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by Reference ID, Provider Ref, or User ID..."
            className="bg-transparent border-none text-xs text-white placeholder-gray-500 outline-none w-full"
          />
        </div>
      </div>

      {/* Queue Table / Cards */}
      {loading ? (
        <div className="p-12 text-center text-xs text-gray-400 bg-gray-900/40 border border-gray-800 rounded-xl flex items-center justify-center gap-2">
          <Loader2 className="animate-spin" size={16} />
          Fetching unmatched deposits queue...
        </div>
      ) : filteredDeposits.length === 0 ? (
        <div className="p-12 text-center bg-gray-900/40 border border-gray-800 rounded-xl space-y-2">
          <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
          <h3 className="text-sm font-bold text-white">Reconciliation Queue Clean</h3>
          <p className="text-xs text-gray-400">All successful deposits have been automatically reconciled and credited.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDeposits.map((dep) => (
            <div
              key={dep.id}
              className="p-4 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl space-y-3 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-white">
                      {dep.currency} {parseFloat(String(dep.amount)).toLocaleString()}
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase border border-amber-500/30">
                      {dep.reconciliation_status || 'UNMATCHED'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                    <span>Tx Ref: <strong className="text-gray-300">{dep.reference_id}</strong></span>
                    <span>Provider Ref: <strong className="text-gray-300">{dep.provider_reference || dep.metadata?.fincra_reference || 'N/A'}</strong></span>
                    <span>User: <strong className="text-gray-300">{dep.user_id}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReconcile(dep)}
                    disabled={reconcilingId === dep.id}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1.5"
                  >
                    {reconcilingId === dep.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Post Ledger Credit & Reconcile
                  </button>
                </div>
              </div>

              {/* Status matrix & details */}
              <div className="grid grid-cols-4 gap-2 text-[10px] pt-2 border-t border-gray-800/60">
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <span className="text-gray-500 uppercase font-bold block text-[9px]">Payment Status</span>
                  <span className="font-bold text-amber-300">{dep.payment_status || dep.status}</span>
                </div>
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <span className="text-gray-500 uppercase font-bold block text-[9px]">Receipt Status</span>
                  <span className="font-bold text-gray-300">{dep.receipt_status || 'NOT_PROVIDED'}</span>
                </div>
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <span className="text-gray-500 uppercase font-bold block text-[9px]">Wallet Credit</span>
                  <span className="font-bold text-amber-300">{dep.wallet_credit_status || 'PENDING'}</span>
                </div>
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <span className="text-gray-500 uppercase font-bold block text-[9px]">Created At</span>
                  <span className="font-bold text-gray-400">{new Date(dep.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReconciliation;
