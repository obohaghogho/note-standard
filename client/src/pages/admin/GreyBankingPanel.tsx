import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  RefreshCw, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Server,
  FileCheck,
  Search,
  UserCheck,
  DollarSign
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosInstance';

interface UnallocatedDeposit {
  id: string;
  provider: string;
  currency: string;
  rail: string;
  amount: number;
  sender_name: string;
  sender_account: string;
  memo: string;
  status: string;
  reason: string;
  created_at: string;
}

export const GreyBankingPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [unallocatedList, setUnallocatedList] = useState<UnallocatedDeposit[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState<string>('');

  const fetchUnallocated = async () => {
    setLoading(true);
    try {
      const res = await api.get('/treasury/banking/unallocated');
      if (res.data?.success) {
        setUnallocatedList(res.data.data || []);
      }
    } catch (err: any) {
      console.warn('[GreyBankingPanel] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnallocated();
  }, []);

  const handleAssignUser = async (depositId: string) => {
    if (!targetUserId.trim()) {
      toast.error('Please enter a target User UUID');
      return;
    }

    try {
      const res = await api.post('/treasury/banking/assign', {
        unallocatedId: depositId,
        userId: targetUserId.trim()
      });

      if (res.data?.success) {
        toast.success(`Deposit assigned & credited cleanly to user ${targetUserId.slice(0, 8)}...!`);
        setAssigningId(null);
        setTargetUserId('');
        fetchUnallocated();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Assignment failed');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="text-indigo-400" size={28} />
            Grey Lead Bank Business Banking Panel
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            U.S. Virtual Checking Account management, ACH vs Wire volume monitoring & Unallocated Deposit resolution queue.
          </p>
        </div>
        <button
          onClick={fetchUnallocated}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh Unallocated Queue
        </button>
      </div>

      {/* Account Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Bank Partner</span>
            <ShieldCheck size={16} className="text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white">Lead Bank (Virtual USD Checking)</p>
          <p className="text-xs text-slate-400">ACH Routing: <span className="font-mono text-slate-200">074000010</span></p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Supported Payment Rails</span>
            <ArrowUpRight size={16} className="text-indigo-400" />
          </div>
          <p className="text-xl font-bold text-white">ACH & Domestic Wire</p>
          <p className="text-xs text-amber-400">SWIFT International Wires: Unsupported</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Unallocated Queue Size</span>
            <AlertTriangle size={16} className={unallocatedList.length > 0 ? 'text-amber-400' : 'text-slate-500'} />
          </div>
          <p className="text-xl font-bold text-white">{unallocatedList.length} <span className="text-xs font-normal text-slate-400">deposits pending review</span></p>
          <p className="text-xs text-emerald-400">Requires Admin Confidence Review</p>
        </div>
      </div>

      {/* Unallocated Deposit Review Queue */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Search className="text-indigo-400" size={20} />
            Unallocated Deposits Resolution Queue
          </h2>
          <span className="text-xs text-slate-400 font-mono">Confidence Score &lt; 95%</span>
        </div>

        {unallocatedList.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm space-y-2">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500/40" />
            <p className="font-semibold text-slate-300">Unallocated Queue is Empty</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              All incoming ACH and Wire deposits have been matched and credited automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3">Received At</th>
                  <th className="p-3">Rail</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Sender Name / Account</th>
                  <th className="p-3">Memo / Narration</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {unallocatedList.map((dep) => (
                  <tr key={dep.id} className="hover:bg-slate-800/50">
                    <td className="p-3 text-slate-400">{new Date(dep.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono font-bold">
                        {dep.rail}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-400">${dep.amount?.toLocaleString()} {dep.currency}</td>
                    <td className="p-3 text-slate-200 font-medium">{dep.sender_name} ({dep.sender_account || 'N/A'})</td>
                    <td className="p-3 font-mono text-slate-300">{dep.memo || 'None'}</td>
                    <td className="p-3 text-amber-400">{dep.reason}</td>
                    <td className="p-3 text-right">
                      {assigningId === dep.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <input
                            type="text"
                            placeholder="User UUID..."
                            value={targetUserId}
                            onChange={(e) => setTargetUserId(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-white text-xs px-2 py-1 rounded w-36"
                          />
                          <button
                            onClick={() => handleAssignUser(dep.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                          >
                            Assign
                          </button>
                          <button
                            onClick={() => setAssigningId(null)}
                            className="px-2 py-1 bg-slate-800 text-slate-400 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssigningId(dep.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center gap-1 ml-auto"
                        >
                          <UserCheck size={12} /> Resolve & Assign
                        </button>
                      )}
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

export default GreyBankingPanel;
