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
  const [data, setData] = useState<PushHealthData | null>(null);
  const [loading, setLoading] = useState(true);
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
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[PushHealth] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(), 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className="ph-loading">
        <div className="ph-spinner" />
        <p>Loading push health data…</p>
      </div>
    );
  }

  const d = data!;

  // ── Failure bar chart max ──
  const maxFailure = Math.max(
    d.failureBreakdown['403'],
    d.failureBreakdown['404'],
    d.failureBreakdown['410'],
    d.failureBreakdown.timeout,
    d.failureBreakdown.other,
    1
  );

  const errorBars = [
    { label: '403 Forbidden (VAPID mismatch)', value: d.failureBreakdown['403'], color: '#ef4444' },
    { label: '404 Not Found (endpoint gone)', value: d.failureBreakdown['404'], color: '#f97316' },
    { label: '410 Gone (subscription expired)', value: d.failureBreakdown['410'], color: '#f59e0b' },
    { label: 'Timeout', value: d.failureBreakdown.timeout, color: '#6366f1' },
    { label: 'Other errors', value: d.failureBreakdown.other, color: '#64748b' },
  ];

  const deviceItems = [
    { name: 'Android', value: d.deviceBreakdown.android, color: '#34d399', icon: Smartphone },
    { name: 'iOS', value: d.deviceBreakdown.ios, color: '#818cf8', icon: Tablet },
    { name: 'Desktop', value: d.deviceBreakdown.desktop, color: '#60a5fa', icon: Monitor },
    { name: 'Unknown', value: d.deviceBreakdown.unknown, color: '#475569', icon: Shield },
  ];

  return (
    <div className="push-health-page">

      {/* ─── Header ─── */}
      <div className="ph-header">
        <div className="ph-header-left">
          <div className="ph-header-icon">
            <Bell size={20} color="white" />
          </div>
          <div>
            <h1>Push Health Dashboard</h1>
            <p>Real-time push notification telemetry · auto-refreshes every 30s</p>
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
            onClick={() => fetchHealth(true)}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── Section: Overview ─── */}
      <p className="ph-section-title">Subscription Overview</p>
      <div className="ph-stat-grid">
        {[
          { label: 'Total Subscriptions', value: d.overview.totalSubscriptions, color: 'blue',   icon: Bell },
          { label: 'Healthy',             value: d.overview.healthy,            color: 'green',  icon: CheckCircle },
          { label: 'Stale (30d+)',        value: d.overview.stale,              color: 'amber',  icon: Clock },
          { label: 'Invalid',             value: d.overview.invalid,            color: 'red',    icon: XCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`ph-stat-card ${color}`}>
            <div className="ph-stat-icon"><Icon size={18} /></div>
            <div className="ph-stat-value">{value.toLocaleString()}</div>
            <div className="ph-stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* ─── Section: Today's Push Metrics ─── */}
      <p className="ph-section-title">Push Success Metrics — Today</p>
      <div className="ph-stat-grid">
        {[
          { label: 'Attempted',      value: d.metricsToday.attempted, color: 'cyan',   icon: Activity },
          { label: 'Accepted',       value: d.metricsToday.accepted,  color: 'green',  icon: CheckCircle },
          { label: 'Failures',       value: d.metricsToday.failed,    color: 'red',    icon: XCircle },
          { label: 'Success Rate',   value: `${d.metricsToday.successRate}%`, color: d.metricsToday.successRate >= 90 ? 'green' : d.metricsToday.successRate >= 70 ? 'amber' : 'red', icon: Shield },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`ph-stat-card ${color}`}>
            <div className="ph-stat-icon"><Icon size={18} /></div>
            <div className="ph-stat-value">{value}</div>
            <div className="ph-stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* ─── Section: Breakdown panels ─── */}
      <p className="ph-section-title">Diagnostics</p>
      <div className="ph-two-col">

        {/* Success Rate Panel */}
        <div className="ph-panel">
          <h3><Activity size={16} /> Push Success Rate</h3>
          <div className="ph-gauge-container">
            <GaugeCircle pct={d.metricsToday.successRate} />
            <div className="ph-metric-rows">
              <div className="ph-metric-row">
                <span className="label">Attempted</span>
                <span className="val">{d.metricsToday.attempted}</span>
              </div>
              <div className="ph-metric-row">
                <span className="label">Accepted</span>
                <span className="val success">{d.metricsToday.accepted}</span>
              </div>
              <div className="ph-metric-row">
                <span className="label">Failed</span>
                <span className="val fail">{d.metricsToday.failed}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Breakdown Panel */}
        <div className="ph-panel">
          <h3><AlertTriangle size={16} /> Failure Breakdown</h3>
          <div className="ph-bar-list">
            {errorBars.map(bar => (
              <div className="ph-bar-row" key={bar.label}>
                <div className="ph-bar-label">
                  <span>{bar.label}</span>
                  <span>{bar.value}</span>
                </div>
                <div className="ph-bar-track">
                  <div
                    className="ph-bar-fill"
                    style={{
                      width: `${(bar.value / maxFailure) * 100}%`,
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

      {/* ─── Section: Device + Multi-device ─── */}
      <p className="ph-section-title">Device Intelligence</p>
      <div className="ph-two-col">

        {/* Device Breakdown */}
        <div className="ph-panel">
          <h3><Smartphone size={16} /> Device Breakdown</h3>
          <div className="ph-device-grid">
            {deviceItems.map(({ name, value, color, icon: Icon }) => (
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
          {d.topMultiDevice.length === 0 ? (
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
                  {d.topMultiDevice.map(u => (
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

      {/* ─── Section: Recent Activity Feed ─── */}
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
              {d.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#475569', textAlign: 'center' }}>
                    No push activity recorded yet today.
                  </td>
                </tr>
              ) : d.recentActivity.map((row, i) => (
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

    </div>
  );
};

export default PushHealthDashboard;
