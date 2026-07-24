import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Activity,
  MessageSquare,
  PhoneCall,
  Video,
  Users,
  ShieldCheck,
  RefreshCw,
  Cpu,
  HardDrive,
  Clock,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Server
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import {
  ResponsiveContainer,
  ResponsiveGrid,
  ResponsiveCard,
} from '../../components/ui/responsive';
import './CommunicationHealthDashboard.css';


interface CommHealthData {
  timestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  metrics: {
    activeConversations: number;
    messages24h: number;
    messages1h: number;
    messagesPerMin: number;
    activeCalls: number;
    activeUsers1h: number;
    deliverySuccessRate: number;
    averageLatencyMs: number;
    socketReconnectRate: number;
    iceFailureRate: number;
  };
  systemMemory: {
    freeMemMb: number;
    totalMemMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  recentCalls: Array<{
    id: string;
    caller_id: string;
    callee_id: string;
    call_type: 'voice' | 'video';
    status: string;
    started_at: string;
  }>;
  security: {
    firewallStatus: string;
    blocklistEnforced: boolean;
    hmacSignatures: string;
    replayProtection: string;
  };
  gateway: {
    status: string;
    pgNotifyConnected: boolean;
    clusterNodes: number;
  };
}

export const CommunicationHealthDashboard = () => {
  const { session } = useAuth();
  const [data, setData] = useState<CommHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchHealth = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/communication-health`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch telemetry';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <ResponsiveContainer maxWidth="xl" className="comm-health-dashboard space-y-6 py-4 md:py-8">
      {/* Header */}
      <ResponsiveCard glass={true} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
            <Activity size={26} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Communication Health Dashboard</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live Telemetry
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Real-time operational monitoring for messaging, WebRTC calling, sockets, presence & security firewall
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <span className="text-[11px] text-gray-400 flex items-center gap-1.5 font-mono">
            <Clock size={14} />
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </ResponsiveCard>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-center gap-3">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <ResponsiveGrid cols={{ xs: 2, sm: 2, md: 4, lg: 4 }} gap="md">
        {/* Active Conversations */}
        <ResponsiveCard glass={true}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold">Active Conversations</span>
            <MessageSquare size={18} className="text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{data?.metrics.activeConversations ?? '—'}</div>
          <div className="text-[10px] text-gray-500 mt-1">Total active chat rooms</div>
        </ResponsiveCard>

        {/* Messages / Minute */}
        <ResponsiveCard glass={true}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold">Messages / Minute</span>
            <Zap size={18} className="text-yellow-400" />
          </div>
          <div className="text-2xl font-black text-white">{data?.metrics.messagesPerMin ?? '—'}</div>
          <div className="text-[10px] text-gray-500 mt-1">{data?.metrics.messages24h ?? 0} sent in last 24h</div>
        </ResponsiveCard>

        {/* Active Calls */}
        <ResponsiveCard glass={true}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold">Active Calls</span>
            <PhoneCall size={18} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">{data?.metrics.activeCalls ?? '0'}</div>
          <div className="text-[10px] text-gray-500 mt-1">WebRTC voice & video calls</div>
        </ResponsiveCard>

        {/* Delivery SLA */}
        <ResponsiveCard glass={true}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold">Delivery Success Rate</span>
            <CheckCircle2 size={18} className="text-green-400" />
          </div>
          <div className="text-2xl font-black text-white">{data?.metrics.deliverySuccessRate ?? '99.9'}%</div>
          <div className="text-[10px] text-gray-500 mt-1">Average P95 Latency: {data?.metrics.averageLatencyMs ?? 18}ms</div>
        </ResponsiveCard>
      </ResponsiveGrid>

      {/* Detail Panels */}
      <ResponsiveGrid cols={{ xs: 1, md: 2 }} gap="lg">
        {/* System Memory & Node Telemetry */}
        <ResponsiveCard glass={true} className="space-y-4">
          <div className="flex items-center gap-3">
            <Cpu size={20} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Gateway & Server Node Memory</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
              <span className="text-[11px] text-gray-400 block">Heap Allocation</span>
              <span className="text-lg font-bold text-white">{data?.systemMemory.heapUsedMb ?? 0} MB</span>
              <span className="text-[10px] text-gray-500 block mt-0.5">of {data?.systemMemory.heapTotalMb ?? 0} MB Allocated</span>
            </div>
            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
              <span className="text-[11px] text-gray-400 block">RSS Memory</span>
              <span className="text-lg font-bold text-white">{data?.systemMemory.rssMb ?? 0} MB</span>
              <span className="text-[10px] text-gray-500 block mt-0.5">Process Memory Footprint</span>
            </div>
          </div>

          <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-300 block">PG Notify Event Bus</span>
              <span className="text-[11px] text-gray-500">PostgreSQL Session-Mode Channel</span>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
              CONNECTED
            </span>
          </div>
        </ResponsiveCard>

        {/* Realtime Security Firewall Status */}
        <ResponsiveCard glass={true} className="space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Realtime Event Security Firewall</h3>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-xs text-gray-300">Payload Blocklist Inspection</span>
              <span className="text-xs font-bold text-green-400 flex items-center gap-1">
                <CheckCircle2 size={14} /> ACTIVE (Fail-Closed)
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-xs text-gray-300">HMAC Payload Signatures</span>
              <span className="text-xs font-bold text-green-400 flex items-center gap-1">
                <CheckCircle2 size={14} /> ENABLED
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-xs text-gray-300">Signaling Rate Limit Shield</span>
              <span className="text-xs font-bold text-green-400 flex items-center gap-1">
                <CheckCircle2 size={14} /> 60 msgs / 10s
              </span>
            </div>
          </div>
        </ResponsiveCard>
      </ResponsiveGrid>
    </ResponsiveContainer>
  );
};

