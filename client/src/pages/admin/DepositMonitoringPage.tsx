import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, UserCheck, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_URL } from '../../lib/api';
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

  return (
    <div className="deposit-monitoring-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.5rem', fontWeight: 700 }}>
          <Activity size={24} color="#818cf8" />
          <span>Deposit Monitoring & Unallocated Queue</span>
        </div>
        <button className="btn-secondary" onClick={fetchData}>
          <RefreshCw size={16} /> Refresh Metrics
        </button>
      </div>

      {stats && (
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-title">Today's Volume</div>
            <div className="metric-value">${stats.todaysVolume.toLocaleString()}</div>
          </div>
          <div className="metric-card">
            <div className="metric-title">Today's Deposits</div>
            <div className="metric-value">{stats.todaysDeposits}</div>
          </div>
          <div className="metric-card">
            <div className="metric-title">Pending Settlement</div>
            <div className="metric-value">{stats.pendingSettlement}</div>
          </div>
          <div className="metric-card">
            <div className="metric-title">Unallocated Queue</div>
            <div className="metric-value" style={{ color: '#fca5a5' }}>{stats.counts.UNALLOCATED}</div>
          </div>
          <div className="metric-card">
            <div className="metric-title">Success Rate</div>
            <div className="metric-value" style={{ color: '#34d399' }}>{stats.successRate}</div>
          </div>
        </div>
      )}

      <div className="table-card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} color="#fca5a5" />
          Unallocated & Manual Replay Queue
        </h3>

        {loading ? (
          <div>Loading queue...</div>
        ) : unallocated.length === 0 ? (
          <div style={{ padding: '24px 0', color: '#94a3b8' }}>No unallocated deposits requiring review.</div>
        ) : (
          <table className="deposits-table">
            <thead>
              <tr>
                <th>Received At</th>
                <th>Currency</th>
                <th>Amount</th>
                <th>Sender</th>
                <th>Bank Reference</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {unallocated.map((dep) => (
                <tr key={dep.id}>
                  <td>{new Date(dep.received_at).toLocaleTimeString()}</td>
                  <td>{dep.currency}</td>
                  <td style={{ fontWeight: 700 }}>{dep.amount}</td>
                  <td>{dep.sender_name}</td>
                  <td>{dep.bank_reference || 'N/A'}</td>
                  <td>
                    <span className={`badge-status ${dep.status.toLowerCase()}`}>{dep.status}</span>
                  </td>
                  <td>
                    {dep.status === 'UNALLOCATED' && (
                      <button
                        className="btn-secondary"
                        onClick={() => setAssignModalId(dep.id)}
                        style={{ background: '#312e81', color: '#818cf8' }}
                      >
                        <UserCheck size={14} /> Assign & Replay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assignModalId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '24px', borderRadius: '12px', width: '400px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}>Assign Customer & Replay Journal</h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '16px' }}>
              Select customer user ID to credit. This will post correlated Treasury and Customer Liability double-entry journals.
            </p>
            <input
              type="text"
              placeholder="Enter User ID (e.g. usr_16step_master)"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => setAssignModalId(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleAssign}>Execute Replay</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositMonitoringPage;
