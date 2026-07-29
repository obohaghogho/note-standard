'use strict';
/**
 * ReportingService.js
 * ===================
 * Generates periodic compliance and operational reports for finance,
 * compliance, and audit teams.
 *
 * Supports:
 *   - Deposit reports
 *   - Withdrawal reports
 *   - Settlement reports
 *   - Reserve ratio reports
 *   - SLA performance reports
 *   - Reconciliation summaries
 *
 * Output formats: JSON (default) | CSV
 *
 * @module services/reporting/ReportingService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// ─── CSV Utility ──────────────────────────────────────────────────────────────
function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines   = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const val = row[h] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(','));
  }
  return lines.join('\n');
}

const ReportingService = {
  // ─── Deposit Report ─────────────────────────────────────────────────────────

  /**
   * Generate deposit report for a time range.
   * @param {Object} params
   * @param {string}  params.from       ISO date string
   * @param {string}  params.to         ISO date string
   * @param {string}  [params.currency]
   * @param {string}  [params.format]   'json' | 'csv'
   */
  async generateDepositReport({ from, to, currency, format = 'json' }) {
    let query = supabase
      .from('transactions')
      .select('reference_id, user_id, amount, currency, requested_currency, requested_amount, exchange_rate, provider, status, created_at, metadata')
      .eq('type', 'DEPOSIT')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });

    if (currency) query = query.eq('currency', String(currency).toUpperCase());

    const { data, error } = await query;
    if (error) throw new Error(`[ReportingService] Deposit query failed: ${error.message}`);

    const rows = (data || []).map(t => ({
      reference:          t.reference_id,
      user_id:            t.user_id,
      amount:             t.amount,
      currency:           t.currency,
      requested_currency: t.requested_currency,
      requested_amount:   t.requested_amount,
      exchange_rate:      t.exchange_rate,
      provider:           t.provider,
      status:             t.status,
      created_at:         t.created_at,
    }));

    const summary = this._summarise(rows, 'amount');

    return this._format({ type: 'DEPOSIT', from, to, summary, rows }, format);
  },

  // ─── Withdrawal Report ───────────────────────────────────────────────────────

  async generateWithdrawalReport({ from, to, currency, format = 'json' }) {
    let query = supabase
      .from('transactions')
      .select('reference_id, user_id, amount, currency, requested_currency, provider, status, created_at')
      .in('type', ['WITHDRAWAL', 'PAYOUT'])
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });

    if (currency) query = query.eq('currency', String(currency).toUpperCase());

    const { data, error } = await query;
    if (error) throw new Error(`[ReportingService] Withdrawal query failed: ${error.message}`);

    const rows = (data || []).map(t => ({
      reference:  t.reference_id,
      user_id:    t.user_id,
      amount:     t.amount,
      currency:   t.currency,
      provider:   t.provider,
      status:     t.status,
      created_at: t.created_at,
    }));

    const summary = this._summarise(rows, 'amount');
    return this._format({ type: 'WITHDRAWAL', from, to, summary, rows }, format);
  },

  // ─── Settlement Report ───────────────────────────────────────────────────────

  async generateSettlementReport({ from, to, format = 'json' }) {
    const { data, error } = await supabase
      .from('settlement_positions')
      .select('*')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[ReportingService] Settlement query failed: ${error.message}`);

    const rows = data || [];
    const byStage = rows.reduce((acc, r) => {
      acc[r.current_stage] = (acc[r.current_stage] || 0) + 1;
      return acc;
    }, {});

    const summary = { total: rows.length, by_stage: byStage };
    return this._format({ type: 'SETTLEMENT', from, to, summary, rows }, format);
  },

  // ─── Reserve Ratio Report ────────────────────────────────────────────────────

  async generateReserveRatioReport({ date, format = 'json' }) {
    // Nearest snapshot on or before the given date
    const { data, error } = await supabase
      .from('reserve_ratios')
      .select('*')
      .lte('computed_at', date || new Date().toISOString())
      .order('computed_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(`[ReportingService] Reserve ratio query failed: ${error.message}`);

    // De-dupe: latest per currency
    const seen = new Set();
    const rows = (data || []).filter(r => {
      if (seen.has(r.currency)) return false;
      seen.add(r.currency);
      return true;
    });

    const summary = {
      currencies:  rows.map(r => r.currency),
      healthy:     rows.filter(r => r.status === 'HEALTHY').length,
      warning:     rows.filter(r => r.status === 'WARN').length,
      critical:    rows.filter(r => ['CRITICAL', 'EMERGENCY'].includes(r.status)).length,
    };

    return this._format({ type: 'RESERVE_RATIO', date, summary, rows }, format);
  },

  // ─── SLA Report ──────────────────────────────────────────────────────────────

  async generateSLAReport({ from, to, format = 'json' }) {
    const { data, error } = await supabase
      .from('provider_sla_metrics')
      .select('*')
      .gte('computed_at', from)
      .lte('computed_at', to)
      .order('computed_at', { ascending: false });

    if (error) throw new Error(`[ReportingService] SLA query failed: ${error.message}`);

    const rows    = data || [];
    const byProv  = {};
    for (const r of rows) {
      if (!byProv[r.provider]) byProv[r.provider] = [];
      byProv[r.provider].push(r);
    }

    const summary = Object.entries(byProv).map(([provider, records]) => {
      const latest = records[0];
      return {
        provider,
        samples:       records.length,
        avg_p50_ms:    this._avg(records, 'p50_ms'),
        avg_p95_ms:    this._avg(records, 'p95_ms'),
        avg_success_rate: this._avg(records, 'success_rate'),
        sla_breaches:  records.filter(r => r.sla_breached).length,
        last_computed: latest?.computed_at,
      };
    });

    return this._format({ type: 'SLA', from, to, summary, rows }, format);
  },

  // ─── Reconciliation Summary ──────────────────────────────────────────────────

  async generateReconciliationSummary({ runId, format = 'json' }) {
    let query = supabase
      .from('nightly_reconciliation_runs')
      .select('*')
      .order('started_at', { ascending: false });

    if (runId) query = query.eq('id', runId);
    else       query = query.limit(10);

    const { data, error } = await query;
    if (error) throw new Error(`[ReportingService] Reconciliation query failed: ${error.message}`);

    const rows = data || [];
    const summary = {
      total_runs:    rows.length,
      successful:    rows.filter(r => r.status === 'SUCCESS').length,
      failed:        rows.filter(r => r.status === 'FAILED').length,
      in_progress:   rows.filter(r => r.status === 'RUNNING').length,
    };

    return this._format({ type: 'RECONCILIATION', run_id: runId, summary, rows }, format);
  },

  // ─── Internal Helpers ────────────────────────────────────────────────────────

  _summarise(rows, amountField) {
    if (!rows.length) return { count: 0, total: 0, by_status: {}, by_provider: {}, by_currency: {} };

    const byStatus   = {};
    const byProvider = {};
    const byCurrency = {};
    let total = 0;

    for (const r of rows) {
      const amt = parseFloat(r[amountField] || 0);
      total += amt;
      byStatus[r.status]     = (byStatus[r.status]     || 0) + 1;
      byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
      byCurrency[r.currency] = (byCurrency[r.currency] || 0) + amt;
    }

    return {
      count:       rows.length,
      total:       parseFloat(total.toFixed(8)),
      by_status:   byStatus,
      by_provider: byProvider,
      by_currency: byCurrency,
    };
  },

  _avg(rows, field) {
    if (!rows.length) return 0;
    return parseFloat((rows.reduce((s, r) => s + parseFloat(r[field] || 0), 0) / rows.length).toFixed(2));
  },

  _format(payload, format) {
    const report = {
      generated_at: new Date().toISOString(),
      ...payload,
    };

    if (format === 'csv') {
      const rows = payload.rows || [];
      return {
        ...report,
        csv:  toCSV(rows),
        rows: undefined,
      };
    }

    return report;
  },
};

module.exports = ReportingService;
