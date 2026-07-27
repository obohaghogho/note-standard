/**
 * Fincra Admin Panel — Standalone Frontend Component
 * ─────────────────────────────────────────────────────
 * NEW FILE. No existing admin components are modified.
 *
 * Provides admin visibility into:
 *  - Fincra webhook logs (with signature status & processing status)
 *  - Fincra audit trail (all financial actions)
 *  - Reconciliation runner (compare internal ledger vs Fincra)
 *
 * This component is Admin-only. Mount it inside your existing AdminDashboard
 * as a lazy-loaded tab — no modifications needed to the existing admin routes.
 */

import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

type Tab = "webhooks" | "audit" | "reconcile";

interface WebhookLog {
  id:                 string;
  event_type:         string;
  signature_verified: boolean;
  processed:          boolean;
  created_at:         string;
  payload?:           Record<string, unknown>;
}

interface AuditLog {
  id:         string;
  action:     string;
  user_id:    string | null;
  details:    Record<string, unknown>;
  created_at: string;
}

interface ReconciliationReport {
  currency:          string;
  fromDate?:         string;
  toDate?:           string;
  ranAt:             string;
  internalCount:     number;
  fincraCount:       number;
  matched:           string[];
  missingInFincra:   unknown[];
  missingInLedger:   unknown[];
  amountMismatches:  unknown[];
  warnings:          string[];
}

export const FincraAdminPanel: React.FC = () => {
  const [activeTab,  setActiveTab]  = useState<Tab>("webhooks");
  const [webhooks,   setWebhooks]   = useState<WebhookLog[]>([]);
  const [auditLogs,  setAuditLogs]  = useState<AuditLog[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Reconciliation state
  const [recCurrency, setRecCurrency] = useState("NGN");
  const [recFrom,     setRecFrom]     = useState("");
  const [recTo,       setRecTo]       = useState("");
  const [recReport,   setRecReport]   = useState<ReconciliationReport | null>(null);
  const [recRunning,  setRecRunning]  = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    return {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  useEffect(() => {
    if (activeTab === "webhooks") fetchWebhookLogs();
    if (activeTab === "audit")    fetchAuditLogs();
  }, [activeTab]);

  async function fetchWebhookLogs() {
    setLoading(true);
    setError(null);
    try {
      const supabaseKey = null; // Admin reads through supabase service role via backend
      // Use admin API endpoint (protected by requireAdmin on backend)
      const res  = await fetch(`${API_BASE}/api/admin/fincra/webhook-logs`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to fetch webhook logs.");
      }
      const body = await res.json();
      setWebhooks(body.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuditLogs() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/admin/fincra/audit-logs`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to fetch audit logs.");
      }
      const body = await res.json();
      setAuditLogs(body.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runReconciliation() {
    setRecRunning(true);
    setRecReport(null);
    try {
      const res  = await fetch(`${API_BASE}/api/fincra/reconcile`, {
        method:  "POST",
        headers: getAuthHeaders(),
        body:    JSON.stringify({ currency: recCurrency, fromDate: recFrom || undefined, toDate: recTo || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Reconciliation failed.");
      setRecReport(body.report);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRecRunning(false);
    }
  }

  return (
    <div className="fincra-admin" role="region" aria-label="Fincra Admin Panel">
      <div className="fincra-admin__header">
        <h2 className="fincra-admin__title">Fincra & Financial Gateway Infrastructure</h2>
        <p className="fincra-admin__subtitle">Enterprise Egress Gateway & Multi-Currency Telemetry</p>
      </div>

      {/* ── Gateway Telemetry Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#fff' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>Egress Gateway IP</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8', marginTop: '4px' }}>137.184.216.44</div>
          <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '4px' }}>● Static IP Allowed (DigitalOcean)</div>
        </div>

        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#fff' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>Primary Fiat Provider</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4ade80', marginTop: '4px' }}>Fincra Production</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>NGN · USD · EUR · GBP Collections</div>
        </div>

        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#fff' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>BaaS & Stablecoin Rails</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#a78bfa', marginTop: '4px' }}>Anchor & Crypto</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>USDT · USDC · USD Treasury</div>
        </div>

        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', color: '#fff' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>Gateway Routing Endpoint</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9', marginTop: '4px', wordBreak: 'break-all' }}>gateway.notestandard.com</div>
          <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '4px' }}>🔒 HMAC SHA-256 Authenticated</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="fincra-admin__tabs" role="tablist">
        {(["webhooks", "audit", "reconcile"] as Tab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`fincra-admin__tab ${activeTab === tab ? "fincra-admin__tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "webhooks"  ? "Webhook Logs" :
             tab === "audit"     ? "Audit Trail"  :
             "Reconciliation"}
          </button>
        ))}
      </div>

      {error && <p className="fincra-form__error" role="alert">{error}</p>}

      {/* ── Webhook Logs Tab ── */}
      {activeTab === "webhooks" && (
        <div className="fincra-admin__table-wrap">
          {loading ? (
            <p className="fincra-admin__loading">Loading…</p>
          ) : (
            <table className="fincra-admin__table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Signature</th>
                  <th>Processed</th>
                  <th>Received At</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.length === 0 ? (
                  <tr><td colSpan={4} className="fincra-admin__empty">No webhook logs found.</td></tr>
                ) : webhooks.map((w) => (
                  <tr key={w.id}>
                    <td><code>{w.event_type}</code></td>
                    <td>
                      <span className={w.signature_verified ? "fincra-admin__badge--ok" : "fincra-admin__badge--fail"}>
                        {w.signature_verified ? "✓ Valid" : "✗ Invalid"}
                      </span>
                    </td>
                    <td>
                      <span className={w.processed ? "fincra-admin__badge--ok" : "fincra-admin__badge--pending"}>
                        {w.processed ? "Processed" : "Pending"}
                      </span>
                    </td>
                    <td>{new Date(w.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Audit Trail Tab ── */}
      {activeTab === "audit" && (
        <div className="fincra-admin__table-wrap">
          {loading ? (
            <p className="fincra-admin__loading">Loading…</p>
          ) : (
            <table className="fincra-admin__table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>User ID</th>
                  <th>Details</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={4} className="fincra-admin__empty">No audit logs found.</td></tr>
                ) : auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td><code>{a.action}</code></td>
                    <td>{a.user_id ? <code>{a.user_id.slice(0, 8)}…</code> : "—"}</td>
                    <td>
                      <details>
                        <summary>View</summary>
                        <pre className="fincra-admin__json">{JSON.stringify(a.details, null, 2)}</pre>
                      </details>
                    </td>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Reconciliation Tab ── */}
      {activeTab === "reconcile" && (
        <div className="fincra-admin__reconcile">
          <div className="fincra-form__field">
            <label htmlFor="rec-currency">Currency</label>
            <select id="rec-currency" value={recCurrency} onChange={(e) => setRecCurrency(e.target.value)} className="fincra-form__input">
              <option>NGN</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </div>
          <div className="fincra-form__field">
            <label htmlFor="rec-from">From Date</label>
            <input id="rec-from" type="datetime-local" value={recFrom} onChange={(e) => setRecFrom(e.target.value)} className="fincra-form__input" />
          </div>
          <div className="fincra-form__field">
            <label htmlFor="rec-to">To Date</label>
            <input id="rec-to" type="datetime-local" value={recTo} onChange={(e) => setRecTo(e.target.value)} className="fincra-form__input" />
          </div>
          <button className="fincra-btn fincra-btn--primary" onClick={runReconciliation} disabled={recRunning}>
            {recRunning ? "Running Reconciliation…" : "Run Reconciliation"}
          </button>

          {recReport && (
            <div className="fincra-admin__rec-report" role="status" aria-live="polite">
              <h4>Reconciliation Report — {recReport.currency}</h4>
              <p>Ran at: {new Date(recReport.ranAt).toLocaleString()}</p>
              <ul>
                <li>✅ Matched: {recReport.matched.length}</li>
                <li className={recReport.missingInFincra.length > 0 ? "fincra-admin__warn" : ""}>
                  ⚠ Missing in Fincra: {recReport.missingInFincra.length}
                </li>
                <li className={recReport.missingInLedger.length > 0 ? "fincra-admin__warn" : ""}>
                  ⚠ Missing in Internal Ledger: {recReport.missingInLedger.length}
                </li>
                <li className={recReport.amountMismatches.length > 0 ? "fincra-admin__warn" : ""}>
                  ⚠ Amount Mismatches: {recReport.amountMismatches.length}
                </li>
              </ul>
              {recReport.warnings.length > 0 && (
                <details>
                  <summary>Warnings ({recReport.warnings.length})</summary>
                  <ul>{recReport.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FincraAdminPanel;
