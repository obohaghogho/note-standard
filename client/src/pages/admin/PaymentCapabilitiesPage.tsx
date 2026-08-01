import React, { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import { Shield, RefreshCw, Zap, Landmark, CheckCircle2, AlertTriangle, Activity, Search } from 'lucide-react';

interface AdminRailRow {
  id: string;
  currency: string;
  provider: string;
  name: string;
  railType: string;
  operations: string;
  priority: number;
  availability: 'ONLINE' | 'DEGRADED' | 'MAINTENANCE' | 'OFFLINE';
  fee: string;
  minAmount: number;
  maxAmount: number;
  requiredTier: string;
  settlementTime: string;
  recommendedScore: number;
  recommendationBadge: string;
  health: {
    latency: number;
    successRate: number;
    lastChecked: string;
  };
}

interface AdminGridResponse {
  version: number;
  totalRails: number;
  rails: AdminRailRow[];
  providers: {
    name: string;
    status: string;
    latency: number;
    successRate: number;
  }[];
  retrievedAt: string;
}

export default function PaymentCapabilitiesPage() {
  const [data, setData] = useState<AdminGridResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');

  const fetchCapabilities = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get<AdminGridResponse>('/admin/payment-capabilities');
      setData(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load payment capabilities grid');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const res = await axiosInstance.post<AdminGridResponse>('/admin/payment-capabilities/refresh');
      setData(res.data);
      toast.success(`Capabilities refreshed! Version bumped to v${res.data.version}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to refresh capabilities');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCapabilities();
  }, [fetchCapabilities]);

  const filteredRails = (data?.rails || []).filter(rail => {
    const matchesCurrency = selectedCurrency === 'ALL' || rail.currency === selectedCurrency;
    const matchesSearch = rail.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          rail.currency.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          rail.provider.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCurrency && matchesSearch;
  });

  const currencies = Array.from(new Set((data?.rails || []).map(r => r.currency)));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-100">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Landmark className="w-7 h-7 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Payment Capabilities Engine</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              v{data?.version || 24}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Provider-aware multi-currency payment rail matrix and dynamic health router.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-cyan-600/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Probing Providers...' : 'Refresh Capabilities'}
        </button>
      </div>

      {/* Provider Health Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(data?.providers || []).map(prov => (
          <div key={prov.name} className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold capitalize text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                {prov.name} Banking Adapter
              </span>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                🟢 {prov.status}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 pt-1">
              <span>Avg Latency: <strong className="text-slate-200">{prov.latency}ms</strong></span>
              <span>Success Rate: <strong className="text-emerald-400">{prov.successRate}%</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search rail name, currency, or provider..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Currency:</span>
          <select
            value={selectedCurrency}
            onChange={e => setSelectedCurrency(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Currencies ({currencies.length})</option>
            {currencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payment Rails Data Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Currency</th>
                <th className="px-4 py-3.5">Payment Rail</th>
                <th className="px-4 py-3.5">Operation</th>
                <th className="px-4 py-3.5">Provider</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Fee</th>
                <th className="px-4 py-3.5">Settlement</th>
                <th className="px-4 py-3.5">KYC Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading capability grid...
                  </td>
                </tr>
              ) : filteredRails.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No payment rails matched your criteria.
                  </td>
                </tr>
              ) : (
                filteredRails.map(rail => (
                  <tr key={rail.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-bold text-white">
                      <span className="px-2 py-1 bg-slate-800 rounded text-cyan-400 border border-slate-700">
                        {rail.currency}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-sans font-medium text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span>{rail.name}</span>
                        {rail.recommendationBadge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                            ★ {rail.recommendationBadge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        rail.operations.includes('deposit') ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'
                      }`}>
                        {rail.operations}
                      </span>
                    </td>
                    <td className="px-4 py-3 uppercase text-slate-400 font-sans">{rail.provider}</td>
                    <td className="px-4 py-3">#{rail.priority}</td>
                    <td className="px-4 py-3 font-sans">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        🟢 {rail.availability}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{rail.fee}</td>
                    <td className="px-4 py-3 text-slate-400">{rail.settlementTime}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {rail.requiredTier}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
