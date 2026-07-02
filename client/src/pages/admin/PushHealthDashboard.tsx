import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  Users,
  Activity,
  Shield,
  Clock,
  MessageSquare,
  Link,
  Cpu
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import './PushHealthDashboard.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PushHealthData {
  overview: {
    totalSubscriptions: number;
    healthy: number;
    stale: number;
    invalid: number;
  };
  metricsToday: {
    attempted: number;
    accepted: number;
    failed: number;
    successRate: number;
  };
  failureBreakdown: {
    '403': number;
    '404': number;
    '410': number;
    timeout: number;
    other: number;
  };
  deviceBreakdown: {
    android: number;
    ios: number;
    desktop: number;
    unknown: number;
  };
  topMultiDevice: { user_id: string; device_count: number }[];
  recentActivity: {
    timestamp: string;
    user_id: string;
    platform: string;
    result: string;
    error_code: string | null;
  }[];
}

interface MessagingMetricsData {
  metrics: {
    messagesSent: number;
    messagesDelivered: number;
    messagesRead: number;
    socketDeliveries: number;
    pushDeliveries: number;
    ackTimeoutFallbacks: number;
    pushFailures: number;
    avgDeliveryTime: number;
    avgReadTime: number;
    deliverySuccessRate: number;
    pushSuccessRate: number;
  };
  recentTraces: {
    id: string;
    message_id: string;
    recipient_id: string;
    socket_present: boolean;
    push_sent: boolean;
    fallback_used: boolean;
    provider_result: string | null;
    delivery_ack_received: boolean;
    ack_latency_ms: number | null;
    created_at: string;
    routing_decision: string;
    reason: string | null;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function truncateUid(uid: string) {
  return uid ? `${uid.substring(0, 8)}…` : '—';
}

function gaugeColor(pct: number) {
  if (pct >= 90) return '#10b981'; // green
  if (pct >= 70) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

function GaugeCircle({ pct }: { pct: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = gaugeColor(pct);
  return (
    <div className="ph-gauge">
      <svg className="ph-gauge-svg" width="100" height="100" viewBox="0 0 100 100">
        <circle className="ph-gauge-bg" cx="50" cy="50" r={r} />
        <circle
          className="ph-gauge-fill"
          cx="50" cy="50" r={r}
          stroke={color}
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      </svg>
      <div className="ph-gauge-text">
        <span className="ph-gauge-pct" style={{ color }}>{pct}%</span>
        <span className="ph-gauge-sub">success</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PushHealthDashboard = () => {
  const { session } = useAuth();
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'push' | 'messaging'>('push');

  // Push Tab States
  const [pushData, setPushData] = useState<PushHealthData | null>(null);
  const [pushLoading, setPushLoading] = useState(true);

  // Messaging Tab States
  const [messagingData, setMessagingData] = useState<MessagingMetricsData | null>(null);
  const [messagingLoading, setMessagingLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (!session?.access_token) return;
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/push-health`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch push health');
      const json = await res.json();
      setPushData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[PushHealth] fetch error:', err);
    } finally {
      setPushLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  const fetchMessaging = useCallback(async (isManual = false) => {
    if (!session?.access_token) return;
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/messaging-metrics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch messaging metrics');
      const json = await res.json();
      setMessagingData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[MessagingMetrics] fetch error:', err);
    } finally {
      setMessagingLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (activeTab === 'push') {
      fetchHealth();
    } else {
      fetchMessaging();
    }
  }, [activeTab, fetchHealth, fetchMessaging]);

  // Auto-refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'push') {
        fetchHealth();
      } else {
        fetchMessaging();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeTab, fetchHealth, fetchMessaging]);

  const handleRefresh = () => {
    if (activeTab === 'push') {
      fetchHealth(true);
    } else {
      fetchMessaging(true);
    }
  };

  const isLoading = activeTab === 'push' ? pushLoading : messagingLoading;

  if (isLoading) {
    return (
      <div className="ph-loading">
        <div className="ph-spinner" />
        <p>Loading dashboard data…</p>
      </div>
    );
  }

  return (
    <div className="push-health-page">

      {/* ─── Header ─── */}
      <div className="ph-header">
        <div className="ph-header-left">
          <div className="ph-header-icon">
            <Bell size={20} color="white" />
          </div>
          <div>
            <h1>Push & Messaging Observability</h1>
            <p>Real-time gateway telemetry · auto-refreshes every 30s</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastUpdated && (
            <span style={{ fontSize: '0.75rem', color: '#475569' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            className={`ph-refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="ph-tabs">
        <button
          className={`ph-tab ${activeTab === 'push' ? 'active' : ''}`}
          onClick={() => setActiveTab('push')}
        >
          Push Subscriptions
        </button>
        <button
          className={`ph-tab ${activeTab === 'messaging' ? 'active' : ''}`}
          onClick={() => setActiveTab('messaging')}
        >
          V2 Messaging Observability
        </button>
      </div>

      {/* ─── Tab Content: Push Subscriptions ─── */}
      {activeTab === 'push' && pushData && (
        <>
          <p className="ph-section-title">Subscription Overview</p>
          <div className="ph-stat-grid">
            {[
              { label: 'Total Subscriptions', value: pushData.overview.totalSubscriptions, color: 'blue',   icon: Bell },
              { label: 'Healthy',             value: pushData.overview.healthy,            color: 'green',  icon: CheckCircle },
              { label: 'Stale (30d+)',        value: pushData.overview.stale,              color: 'amber',  icon: Clock },
              { label: 'Invalid',             value: pushData.overview.invalid,            color: 'red',    icon: XCircle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`ph-stat-card ${color}`}>
                <div className="ph-stat-icon"><Icon size={18} /></div>
                <div className="ph-stat-value">{value.toLocaleString()}</div>
                <div className="ph-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <p className="ph-section-title">Push Success Metrics — Today</p>
          <div className="ph-stat-grid">
            {[
              { label: 'Attempted',      value: pushData.metricsToday.attempted, color: 'cyan',   icon: Activity },
              { label: 'Accepted',       value: pushData.metricsToday.accepted,  color: 'green',  icon: CheckCircle },
              { label: 'Failures',       value: pushData.metricsToday.failed,    color: 'red',    icon: XCircle },
              { label: 'Success Rate',   value: `${pushData.metricsToday.successRate}%`, color: pushData.metricsToday.successRate >= 90 ? 'green' : pushData.metricsToday.successRate >= 70 ? 'amber' : 'red', icon: Shield },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`ph-stat-card ${color}`}>
                <div className="ph-stat-icon"><Icon size={18} /></div>
                <div className="ph-stat-value">{value}</div>
                <div className="ph-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <p className="ph-section-title">Diagnostics</p>
          <div className="ph-two-col">
            {/* Success Rate Panel */}
            <div className="ph-panel">
              <h3><Activity size={16} /> Push Success Rate</h3>
              <div className="ph-gauge-container">
                <GaugeCircle pct={pushData.metricsToday.successRate} />
                <div className="ph-metric-rows">
                  <div className="ph-metric-row">
                    <span className="label">Attempted</span>
                    <span className="val">{pushData.metricsToday.attempted}</span>
                  </div>
                  <div className="ph-metric-row">
                    <span className="label">Accepted</span>
                    <span className="val success">{pushData.metricsToday.accepted}</span>
                  </div>
                  <div className="ph-metric-row">
                    <span className="label">Failed</span>
                    <span className="val fail">{pushData.metricsToday.failed}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Breakdown Panel */}
            <div className="ph-panel">
              <h3><AlertTriangle size={16} /> Failure Breakdown</h3>
              <div className="ph-bar-list">
                {[
                  { label: '403 Forbidden (VAPID mismatch)', value: pushData.failureBreakdown['403'], color: '#ef4444' },
                  { label: '404 Not Found (endpoint gone)', value: pushData.failureBreakdown['404'], color: '#f97316' },
                  { label: '410 Gone (subscription expired)', value: pushData.failureBreakdown['410'], color: '#f59e0b' },
                  { label: 'Timeout', value: pushData.failureBreakdown.timeout, color: '#6366f1' },
                  { label: 'Other errors', value: pushData.failureBreakdown.other, color: '#64748b' },
                ].map(bar => (
                  <div className="ph-bar-row" key={bar.label}>
                    <div className="ph-bar-label">
                      <span>{bar.label}</span>
                      <span>{bar.value}</span>
                    </div>
                    <div className="ph-bar-track">
                      <div
                        className="ph-bar-fill"
                        style={{
                          width: `${(bar.value / Math.max(pushData.failureBreakdown['403'], pushData.failureBreakdown['404'], pushData.failureBreakdown['410'], pushData.failureBreakdown.timeout, pushData.failureBreakdown.other, 1)) * 100}%`,
                          background: bar.color,
                          opacity: bar.value === 0 ? 0.2 : 1,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="ph-section-title">Device Intelligence</p>
          <div className="ph-two-col">
            {/* Device Breakdown */}
            <div className="ph-panel">
              <h3><Smartphone size={16} /> Device Breakdown</h3>
              <div className="ph-device-grid">
                {[
                  { name: 'Android', value: pushData.deviceBreakdown.android, color: '#34d399', icon: Smartphone },
                  { name: 'iOS', value: pushData.deviceBreakdown.ios, color: '#818cf8', icon: Tablet },
                  { name: 'Desktop', value: pushData.deviceBreakdown.desktop, color: '#60a5fa', icon: Monitor },
                  { name: 'Unknown', value: pushData.deviceBreakdown.unknown, color: '#475569', icon: Shield },
                ].map(({ name, value, color, icon: Icon }) => (
                  <div className="ph-device-item" key={name}>
                    <div className="ph-device-dot" style={{ background: color }} />
                    <div className="ph-device-info">
                      <div className="ph-device-name">{name}</div>
                      <div className="ph-device-count" style={{ color }}>{value}</div>
                    </div>
                    <Icon size={18} style={{ color, opacity: 0.5 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-device Users */}
            <div className="ph-panel">
              <h3><Users size={16} /> Top Multi-Device Users</h3>
              {pushData.topMultiDevice.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  No users with multiple devices found.
                </p>
              ) : (
                <div className="ph-table-wrapper">
                  <table className="ph-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Devices</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushData.topMultiDevice.map(u => (
                        <tr key={u.user_id}>
                          <td className="ph-uid">{truncateUid(u.user_id)}</td>
                          <td>
                            <span className="ph-badge accepted">{u.device_count} devices</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <p className="ph-section-title">Recent Push Activity</p>
          <div className="ph-panel">
            <h3><Clock size={16} /> Live Push Event Feed <span style={{ fontSize: '0.7rem', color: '#475569', marginLeft: '0.5rem' }}>(last 50 events)</span></h3>
            <div className="ph-table-wrapper">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User ID</th>
                    <th>Platform</th>
                    <th>Result</th>
                    <th>Error Code</th>
                  </tr>
                </thead>
                <tbody>
                  {pushData.recentActivity.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: '#475569', textAlign: 'center' }}>
                        No push activity recorded yet today.
                      </td>
                    </tr>
                  ) : pushData.recentActivity.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                        {formatTs(row.timestamp)}
                      </td>
                      <td className="ph-uid">{truncateUid(row.user_id)}</td>
                      <td>{row.platform}</td>
                      <td>
                        <span className={`ph-badge ${row.result}`}>{row.result}</span>
                      </td>
                      <td style={{ color: row.error_code ? '#f87171' : '#475569', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {row.error_code || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── Tab Content: V2 Messaging Observability ─── */}
      {activeTab === 'messaging' && messagingData && (
        <>
          <p className="ph-section-title">Message Lifecycle Volumes</p>
          <div className="ph-stat-grid">
            {[
              { label: 'Messages Sent', value: messagingData.metrics.messagesSent, color: 'blue',   icon: MessageSquare },
              { label: 'Messages Delivered', value: messagingData.metrics.messagesDelivered, color: 'green',  icon: CheckCircle },
              { label: 'Messages Read', value: messagingData.metrics.messagesRead, color: 'purple', icon: CheckCircle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`ph-stat-card ${color}`}>
                <div className="ph-stat-icon"><Icon size={18} /></div>
                <div className="ph-stat-value">{value.toLocaleString()}</div>
                <div className="ph-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <p className="ph-section-title">V2 Gateway Delivery Breakdown</p>
          <div className="ph-stat-grid">
            {[
              { label: 'Socket Deliveries', value: messagingData.metrics.socketDeliveries, color: 'cyan', icon: Link },
              { label: 'Push Fallbacks', value: messagingData.metrics.pushDeliveries, color: 'amber', icon: Bell },
              { label: 'ACK Timeouts', value: messagingData.metrics.ackTimeoutFallbacks, color: 'purple', icon: Clock },
              { label: 'Push Failures', value: messagingData.metrics.pushFailures, color: 'red', icon: XCircle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`ph-stat-card ${color}`}>
                <div className="ph-stat-icon"><Icon size={18} /></div>
                <div className="ph-stat-value">{value}</div>
                <div className="ph-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <p className="ph-section-title">Delivery Latency Analytics</p>
          <div className="ph-stat-grid">
            {[
              { label: 'Avg Delivery Time', value: `${messagingData.metrics.avgDeliveryTime}s`, color: messagingData.metrics.avgDeliveryTime <= 4 ? 'green' : messagingData.metrics.avgDeliveryTime <= 10 ? 'amber' : 'red', icon: Clock },
              { label: 'Avg Read Time', value: `${messagingData.metrics.avgReadTime}s`, color: 'blue', icon: Clock },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`ph-stat-card ${color}`}>
                <div className="ph-stat-icon"><Icon size={18} /></div>
                <div className="ph-stat-value">{value}</div>
                <div className="ph-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <p className="ph-section-title">Quality of Service (KPIs)</p>
          <div className="ph-stat-grid">
            {[
              { label: 'Delivery Success Rate (within 5s)', value: `${messagingData.metrics.deliverySuccessRate}%`, color: messagingData.metrics.deliverySuccessRate >= 95 ? 'green' : messagingData.metrics.deliverySuccessRate >= 80 ? 'amber' : 'red', icon: Shield },
              { label: 'Push Success Rate', value: `${messagingData.metrics.pushSuccessRate}%`, color: messagingData.metrics.pushSuccessRate >= 90 ? 'green' : messagingData.metrics.pushSuccessRate >= 70 ? 'amber' : 'red', icon: Shield },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`ph-stat-card ${color}`}>
                <div className="ph-stat-icon"><Icon size={18} /></div>
                <div className="ph-stat-value">{value}</div>
                <div className="ph-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <p className="ph-section-title">Per-Message Delivery Traces</p>
          <div className="ph-panel">
            <h3><Cpu size={16} /> Recent Delivery Traces <span style={{ fontSize: '0.7rem', color: '#475569', marginLeft: '0.5rem' }}>(last 20 events)</span></h3>
            <div className="ph-table-wrapper">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Trace ID</th>
                    <th>Message ID</th>
                    <th>Recipient</th>
                    <th>Sockets?</th>
                    <th>ACK?</th>
                    <th>ACK Latency</th>
                    <th>Fallback?</th>
                    <th>Push Sent?</th>
                    <th>Push Result</th>
                  </tr>
                </thead>
                <tbody>
                  {messagingData.recentTraces.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ color: '#475569', textAlign: 'center' }}>
                        No V2 message delivery traces recorded yet.
                      </td>
                    </tr>
                  ) : messagingData.recentTraces.map((trace) => (
                    <tr key={trace.id}>
                      <td className="ph-uid">{truncateUid(trace.id)}</td>
                      <td className="ph-uid">{truncateUid(trace.message_id)}</td>
                      <td className="ph-uid">{truncateUid(trace.recipient_id)}</td>
                      <td>
                        <span className={`ph-badge ${trace.socket_present ? 'accepted' : 'failed'}`}>
                          {trace.socket_present ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span className={`ph-badge ${trace.delivery_ack_received ? 'accepted' : 'failed'}`}>
                          {trace.delivery_ack_received ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {trace.ack_latency_ms !== null ? `${(trace.ack_latency_ms / 1000).toFixed(2)}s` : '—'}
                      </td>
                      <td>
                        <span className={`ph-badge ${trace.fallback_used ? 'failed' : 'accepted'}`}>
                          {trace.fallback_used ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span className={`ph-badge ${trace.push_sent ? 'accepted' : 'failed'}`}>
                          {trace.push_sent ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ color: (trace.provider_result || '').includes('fail') ? '#f87171' : '#34d399', fontSize: '0.75rem' }}>
                        {trace.provider_result || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default PushHealthDashboard;
