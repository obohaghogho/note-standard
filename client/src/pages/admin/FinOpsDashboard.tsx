import React, { useState, useEffect } from 'react';
import axiosInstance from '../../../api/axiosInstance';
import './FinOpsDashboard.css';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

export const FinOpsDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('today');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(`/ops/finops?range=${timeRange}`);
      setData(response.data);
    } catch (error) {
      toast.error('Failed to load FinOps data.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  if (loading && !data) {
    return <div className="finops-loading">Loading Financial Operations Data...</div>;
  }

  if (!data) return <div className="finops-error">No data available.</div>;

  const { overview, crypto, reconciliation, treasury, system, feature_flags, timeline } = data;

  const getBannerStatus = () => {
    if (system.health.mode !== 'NORMAL' || system.provider_latency > 60) {
      return { level: 'critical', text: '🔴 Critical: Provider Outage or System Recovery Mode Active' };
    }
    if (reconciliation.active_alerts > 0 || crypto.stuck_transactions > 0 || reconciliation.duplicate_webhooks > 0) {
      return { level: 'warning', text: '🟡 Warning: Unresolved alerts or stuck transactions require attention' };
    }
    return { level: 'normal', text: '🟢 Normal: All systems operational' };
  };

  const banner = getBannerStatus();

  return (
    <div className="finops-dashboard">
      <div className={`finops-banner finops-banner-${banner.level}`}>
        {banner.text}
      </div>

      <div className="finops-header">
        <h1>Financial Operations Dashboard</h1>
        <div className="finops-controls">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button onClick={fetchDashboardData} className="refresh-btn">Refresh</button>
        </div>
      </div>

      <div className="finops-grid">
        {/* Overview Panel */}
        <div className="finops-panel summary">
          <h3>Overview</h3>
          <div className="metric">
            <span className="label">Fiat Funding Volume</span>
            <span className="value">${overview.fiat_funding_volume.toLocaleString()}</span>
          </div>
          <div className="metric">
            <span className="label">Crypto Deposit Volume (All)</span>
            <span className="value">
              {Object.keys(crypto.deposits_volume).length > 0 
                ? Object.entries(crypto.deposits_volume).map(([k,v]) => `${v} ${k}`).join(', ') 
                : '0'}
            </span>
          </div>
          <div className="metric">
            <span className="label">Crypto Withdrawal Volume (All)</span>
            <span className="value">
              {Object.keys(crypto.withdrawals_volume).length > 0 
                ? Object.entries(crypto.withdrawals_volume).map(([k,v]) => `${v} ${k}`).join(', ') 
                : '0'}
            </span>
          </div>
        </div>

        {/* Crypto Lifecycle */}
        <div className="finops-panel danger-zone">
          <h3>Crypto Lifecycle</h3>
          <div className="metric">
            <span className="label">Pending Confirmations</span>
            <span className="value">{crypto.pending_confirmations}</span>
          </div>
          <div className="metric">
            <span className="label">Stuck Transactions (&gt;15m)</span>
            <span className={`value ${crypto.stuck_transactions > 0 ? 'alert' : 'ok'}`}>
              {crypto.stuck_transactions}
            </span>
          </div>
        </div>

        {/* Reconciliation Alerts */}
        <div className="finops-panel alerts">
          <h3>Reconciliation & Interventions</h3>
          <div className="metric">
            <span className="label">Active Unmatched Alerts</span>
            <span className={`value ${reconciliation.active_alerts > 0 ? 'alert' : 'ok'}`}>
              <Link to="/admin/reconciliation" style={{ color: 'inherit' }}>
                {reconciliation.active_alerts}
              </Link>
            </span>
          </div>
          <div className="metric">
            <span className="label">Duplicate Webhook Attempts</span>
            <span className="value">{reconciliation.duplicate_webhooks}</span>
          </div>
          <div className="metric">
            <span className="label">Polling Recoveries</span>
            <span className="value">{reconciliation.polling_recoveries}</span>
          </div>
        </div>

        {/* Treasury */}
        <div className="finops-panel treasury">
          <h3>Treasury & Liabilities</h3>
          <div className="metric">
            <span className="label">System Reserve Balances</span>
            <div className="sub-metric">
              {Object.entries(treasury.system_balances).map(([cur, bal]: any) => (
                <div key={cur}>{cur}: {bal}</div>
              ))}
              {Object.keys(treasury.system_balances).length === 0 && '0'}
            </div>
          </div>
          <div className="metric">
            <span className="label">Total User Liabilities</span>
            <div className="sub-metric">
              {Object.entries(treasury.total_user_liabilities).map(([cur, bal]: any) => (
                <div key={cur}>{cur}: {bal.toFixed(4)}</div>
              ))}
              {Object.keys(treasury.total_user_liabilities).length === 0 && '0'}
            </div>
          </div>
        </div>

        {/* System & Features */}
        <div className="finops-panel features">
          <h3>System Health & Flags</h3>
          <div className="metric">
            <span className="label">System Mode</span>
            <span className={`value status-${system.health.mode.toLowerCase()}`}>
              {system.health.mode}
            </span>
          </div>
          <div className="metric">
            <span className="label">Provider Queue Lag</span>
            <span className="value">{system.provider_latency}s</span>
          </div>
          <div className="metric">
            <span className="label">Crypto Deposits</span>
            <span className={`value ${feature_flags.CRYPTO_DEPOSITS_ENABLED ? 'ok' : 'disabled'}`}>
              {feature_flags.CRYPTO_DEPOSITS_ENABLED ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
          <div className="metric">
            <span className="label">Crypto Withdrawals</span>
            <span className={`value ${feature_flags.CRYPTO_WITHDRAWALS_ENABLED ? 'ok' : 'disabled'}`}>
              {feature_flags.CRYPTO_WITHDRAWALS_ENABLED ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
        </div>

      </div>

      {/* Recent Operational Activity Timeline */}
      <div className="finops-panel timeline-panel">
        <h3>Recent Operational Activity</h3>
        {timeline && timeline.length > 0 ? (
          <div className="timeline-feed">
            {timeline.map((event: any, idx: number) => {
              const d = new Date(event.time);
              const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={idx} className="timeline-event">
                  <span className="timeline-time">{timeString}</span>
                  <span className="timeline-message">{event.message}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="metric"><span className="label">No recent events.</span></div>
        )}
      </div>
    </div>
  );
};
