import React, { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import { 
  ShieldCheck, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  History, 
  Lock, 
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface CurrencySetting {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  release_status: 'DEVELOPMENT' | 'BETA' | 'PENDING_APPROVAL' | 'LIVE' | 'DEPRECATED';
  health_status: 'HEALTHY' | 'MAINTENANCE' | 'DEGRADED' | 'DISABLED';
  canary_percentage: number;
  allowed_regions: string[];
  requested_by?: string;
  requested_at?: string;
  approved_by?: string;
  approved_at?: string;
  maintenance_notice?: string;
  banking_provider?: string;
}

interface PreLaunchChecklist {
  code: string;
  canPromote: boolean;
  passedCount: number;
  totalCount: number;
  checks: { name: string; passed: boolean; detail: string }[];
}

interface AuditLog {
  id: string;
  code: string;
  admin_email: string;
  action: string;
  previous_status?: string;
  new_status?: string;
  previous_health?: string;
  new_health?: string;
  reason?: string;
  created_at: string;
}

export const CurrencyReleaseDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CurrencySetting[]>([]);
  const [checklists, setChecklists] = useState<Record<string, PreLaunchChecklist>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState({ total: 0, live: 0, development: 0, pendingApproval: 0, inMaintenance: 0 });
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.get('/wallet/admin/currency-release-dashboard');
      if (data.success) {
        setSettings(data.settings || []);
        setChecklists(data.checklists || {});
        setAuditLogs(data.auditLogs || []);
        setSummary(data.summary || { total: 0, live: 0, development: 0, pendingApproval: 0, inMaintenance: 0 });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch release dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRequestPromotion = async (code: string) => {
    setSubmitting(true);
    try {
      const { data } = await axiosInstance.post(`/wallet/admin/currencies/${code}/request-promotion`, { reason: actionReason || 'Production rollout request' });
      if (data.success) {
        toast.success(`Promotion requested for ${code}. Awaiting Maker-Checker approval.`);
        setActionReason('');
        await fetchDashboard();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request promotion');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePromotion = async (code: string) => {
    setSubmitting(true);
    try {
      const { data } = await axiosInstance.post(`/wallet/admin/currencies/${code}/approve-promotion`, { reason: actionReason || 'Maker-checker approval granted' });
      if (data.success) {
        toast.success(`🎉 ${code} is now LIVE in production!`);
        setActionReason('');
        await fetchDashboard();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve promotion');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateHealth = async (code: string, healthStatus: string) => {
    setSubmitting(true);
    try {
      const notice = healthStatus === 'MAINTENANCE' ? `Routine provider maintenance for ${code}` : '';
      const { data } = await axiosInstance.patch(`/wallet/admin/currencies/${code}/health`, { healthStatus, maintenanceNotice: notice });
      if (data.success) {
        toast.success(`Health status for ${code} updated to ${healthStatus}`);
        await fetchDashboard();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update health status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070913] text-gray-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Enterprise Currency Release & Governance Platform
            </h1>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Maker-checker approvals, operational health controls, pre-launch verification & immutable auditing
          </p>
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh State
        </button>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase font-semibold">Total Assets</span>
          <div className="text-2xl font-bold text-white mt-1">{summary.total}</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <span className="text-xs text-emerald-400 uppercase font-semibold">🟢 Production Live</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{summary.live}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <span className="text-xs text-amber-400 uppercase font-semibold">🟡 Development</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{summary.development}</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <span className="text-xs text-blue-400 uppercase font-semibold">⏳ Pending Approval</span>
          <div className="text-2xl font-bold text-blue-400 mt-1">{summary.pendingApproval}</div>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
          <span className="text-xs text-rose-400 uppercase font-semibold">🛠️ In Maintenance</span>
          <div className="text-2xl font-bold text-rose-400 mt-1">{summary.inMaintenance}</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Currency Governance Table */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" /> Currency Release Matrix
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="divide-y divide-white/5">
              {settings.map(c => {
                const chk = checklists[c.code];
                const isLive = c.release_status === 'LIVE';
                const isPending = c.release_status === 'PENDING_APPROVAL';

                return (
                  <div key={c.code} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{c.flag}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white">{c.code}</h3>
                          <span className="text-xs text-gray-400">({c.name})</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            isLive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            isPending ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {isLive ? '🟢 LIVE' : isPending ? '⏳ PENDING APPROVAL' : '🟡 DEVELOPMENT'}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            c.health_status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {c.health_status === 'HEALTHY' ? 'HEALTHY' : `🛠️ ${c.health_status}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pre-launch checklist & actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      {chk && (
                        <div className="text-xs text-gray-400 mr-2 flex items-center gap-1">
                          {chk.canPromote ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          )}
                          Checklist: {chk.passedCount}/{chk.totalCount}
                        </div>
                      )}

                      {!isLive && !isPending && (
                        <button
                          onClick={() => handleRequestPromotion(c.code)}
                          disabled={submitting || (chk && !chk.canPromote)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-xs font-semibold"
                        >
                          Request Promotion
                        </button>
                      )}

                      {isPending && (
                        <button
                          onClick={() => handleApprovePromotion(c.code)}
                          disabled={submitting}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Approve Promotion
                        </button>
                      )}

                      {/* Health Switcher */}
                      <select
                        value={c.health_status}
                        onChange={e => handleUpdateHealth(c.code, e.target.value)}
                        className="bg-black/40 border border-white/10 text-xs text-gray-300 rounded px-2 py-1"
                      >
                        <option value="HEALTHY">HEALTHY</option>
                        <option value="MAINTENANCE">MAINTENANCE</option>
                        <option value="DEGRADED">DEGRADED</option>
                        <option value="DISABLED">DISABLED</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Immutable Audit Log Stream */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" /> Immutable Release Audit Trail
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 max-h-[500px] overflow-y-auto space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-gray-400">No audit log entries recorded yet.</p>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="text-xs border-b border-white/5 pb-2.5 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-indigo-300">{log.action}</span>
                    <span className="text-[10px] text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-gray-300">
                    Currency: <span className="font-semibold text-white">{log.code}</span> | By: <span className="text-gray-400">{log.admin_email}</span>
                  </div>
                  {log.reason && <div className="text-[11px] text-gray-400 italic">"{log.reason}"</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
