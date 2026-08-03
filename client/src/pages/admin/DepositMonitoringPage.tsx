import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, UserCheck, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../../lib/api';
import ResponsiveTableWrapper from '../../components/common/ResponsiveTableWrapper';
import BottomSheet from '../../components/common/BottomSheet';
import TruncatedId from '../../components/common/TruncatedId';
import './DepositMonitoringPage.css';

interface UnallocatedDeposit {
  id: string;
  provider: string;
  currency: string;
  amount: number;
  sender_name: string;
  sender_account: string;
  bank_reference: string;
  status: string;
  reason: string;
  received_at: string;
}

export const DepositMonitoringPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [unallocated, setUnallocated] = useState<UnallocatedDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalId, setAssignModalId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/deposit-monitoring`);
      if (res.ok) {
        const json = await res.json();
        setStats(json.stats);
        setUnallocated(json.unallocated || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async () => {
    if (!assignModalId || !assignUserId) {
      toast.error('Please enter a valid User ID');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/unallocated-deposits/${assignModalId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: assignUserId })
      });
      if (res.ok) {
        toast.success('Customer assigned and PostingService replayed successfully!');
        setAssignModalId(null);
        setAssignUserId('');
        fetchData();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to assign customer');
      }
    } catch (e) {
      toast.error('Error assigning customer');
    }
  };

  const headers = [
    { key: 'time', label: 'Received At' },
    { key: 'currency', label: 'Currency' },
    { key: 'amount', label: 'Amount' },
    { key: 'sender', label: 'Sender' },
    { key: 'reference', label: 'Bank Reference' },
    { key: 'status', label: 'Status' },
    { key: 'action', label: 'Action' }
  ];

  return (
    <div className="deposit-monitoring-page px-2 sm:px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 text-xl sm:text-2xl font-bold text-white tracking-tight">
          <Activity size={26} className="text-indigo-400 shrink-0" />
          <span>Deposit Monitoring & Unallocated Queue</span>
        </div>
        <button 
          className="btn-secondary self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-200 hover:bg-gray-800 transition-colors min-h-[44px]" 
          onClick={fetchData}
        >
          <RefreshCw size={16} /> Refresh Metrics
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <div className="metric-card p-4 rounded-xl bg-gray-900/80 border border-gray-800">
            <div className="text-xs text-gray-400 mb-1">Today's Volume</div>
            <div className="text-lg sm:text-xl font-bold text-white">${stats.todaysVolume?.toLocaleString()}</div>
          </div>
          <div className="metric-card p-4 rounded-xl bg-gray-900/80 border border-gray-800">
            <div className="text-xs text-gray-400 mb-1">Today's Deposits</div>
            <div className="text-lg sm:text-xl font-bold text-white">{stats.todaysDeposits}</div>
          </div>
          <div className="metric-card p-4 rounded-xl bg-gray-900/80 border border-gray-800">
            <div className="text-xs text-gray-400 mb-1">Pending Settlement</div>
            <div className="text-lg sm:text-xl font-bold text-amber-300">{stats.pendingSettlement}</div>
          </div>
          <div className="metric-card p-4 rounded-xl bg-gray-900/80 border border-gray-800">
            <div className="text-xs text-gray-400 mb-1">Unallocated Queue</div>
            <div className="text-lg sm:text-xl font-bold text-red-400">{stats.counts?.UNALLOCATED || 0}</div>
          </div>
          <div className="metric-card p-4 rounded-xl bg-gray-900/80 border border-gray-800 col-span-2 sm:col-span-1">
            <div className="text-xs text-gray-400 mb-1">Success Rate</div>
            <div className="text-lg sm:text-xl font-bold text-emerald-400">{stats.successRate}</div>
          </div>
        </div>
      )}

      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 mb-6">
        <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-4">
          <ShieldAlert size={18} className="text-red-400" />
          Unallocated & Manual Replay Queue
        </h3>

        <ResponsiveTableWrapper
          headers={headers}
          data={unallocated}
          loading={loading}
          emptyTitle="No Unallocated Deposits"
          emptyDescription="All incoming deposits have been successfully allocated to customer liability accounts."
          keyExtractor={(dep) => dep.id}
          renderRow={(dep) => (
            <tr key={dep.id} className="hover:bg-white/5 transition-colors">
              <td className="px-4 py-3 text-xs text-gray-300">{new Date(dep.received_at).toLocaleTimeString()}</td>
              <td className="px-4 py-3 text-xs font-bold text-indigo-300">{dep.currency}</td>
              <td className="px-4 py-3 text-xs font-bold text-white">{dep.amount}</td>
              <td className="px-4 py-3 text-xs text-gray-300">{dep.sender_name}</td>
              <td className="px-4 py-3 text-xs text-gray-400"><TruncatedId id={dep.bank_reference || 'N/A'} /></td>
              <td className="px-4 py-3">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">{dep.status}</span>
              </td>
              <td className="px-4 py-3">
                {dep.status === 'UNALLOCATED' && (
                  <button
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold hover:bg-indigo-600/50 flex items-center gap-1.5 transition-colors min-h-[36px]"
                    onClick={() => setAssignModalId(dep.id)}
                  >
                    <UserCheck size={14} /> Assign & Replay
                  </button>
                )}
              </td>
            </tr>
          )}
          renderCard={(dep) => (
            <div className="p-4 rounded-xl bg-gray-900/90 border border-gray-800 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <span className="text-xs text-gray-400">{new Date(dep.received_at).toLocaleTimeString()}</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">{dep.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 block">Amount:</span>
                  <span className="text-sm font-bold text-white">{dep.amount} {dep.currency}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Sender:</span>
                  <span className="text-gray-200 font-medium">{dep.sender_name}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 block">Bank Reference:</span>
                  <TruncatedId id={dep.bank_reference || 'N/A'} startChars={6} endChars={6} />
                </div>
              </div>
              {dep.status === 'UNALLOCATED' && (
                <div className="pt-2 border-t border-gray-800">
                  <button
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20 min-h-[44px]"
                    onClick={() => setAssignModalId(dep.id)}
                  >
                    <UserCheck size={16} /> Assign Customer & Replay
                  </button>
                </div>
              )}
            </div>
          )}
        />
      </div>

      <BottomSheet
        isOpen={!!assignModalId}
        onClose={() => setAssignModalId(null)}
        title="Assign Customer & Replay Journal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button 
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs sm:text-sm transition-colors border border-gray-700 min-h-[44px]" 
              onClick={() => setAssignModalId(null)}
            >
              Cancel
            </button>
            <button 
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-colors shadow-lg shadow-indigo-600/20 min-h-[44px]" 
              onClick={handleAssign}
            >
              Execute Replay
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
            Select customer user ID to credit. This will post correlated Treasury and Customer Liability double-entry journals.
          </p>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-300">Customer User ID</label>
            <input
              type="text"
              placeholder="Enter User ID (e.g. usr_16step_master)"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-700 bg-gray-950 text-white text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

export default DepositMonitoringPage;
