'use strict';
/**
 * TreasuryHealth.js
 * =================
 * Computes a single unified health score for the entire treasury.
 *
 * Aggregates:
 *   - Reserve ratios across all currencies
 *   - Liquidity gaps
 *   - Provider circuit breaker states
 *   - Reconciliation discrepancies
 *   - Settlement backlog
 *   - SystemState (SAFE_MODE / withdrawal mode)
 *
 * Returns a health grade: HEALTHY | DEGRADED | CRITICAL | EMERGENCY
 *
 * @module services/treasury/TreasuryHealth
 */

const supabase     = require('../../config/database');
const logger       = require('../../utils/logger');
const SystemState  = require('../../config/SystemState');

class TreasuryHealth {

  /**
   * Compute the full treasury health report.
   * @returns {Promise<object>}
   */
  async computeHealthReport() {
    const checks = await Promise.allSettled([
      this._checkReserves(),
      this._checkLiquidity(),
      this._checkProviderHealth(),
      this._checkReconciliation(),
      this._checkSettlementBacklog(),
      this._checkSystemState(),
    ]);

    const results = checks.map(c => c.status === 'fulfilled' ? c.value : { score: 0, issues: [c.reason?.message] });
    const [reserves, liquidity, providers, reconciliation, settlements, sysState] = results;

    // Weighted health score (0–100)
    const score = Math.round(
      reserves.score       * 0.35 +
      liquidity.score      * 0.20 +
      providers.score      * 0.20 +
      reconciliation.score * 0.15 +
      settlements.score    * 0.05 +
      sysState.score       * 0.05
    );

    const grade = score >= 90 ? 'HEALTHY'
      : score >= 70 ? 'DEGRADED'
      : score >= 40 ? 'CRITICAL'
      : 'EMERGENCY';

    const allIssues = [
      ...( reserves.issues       || []),
      ...( liquidity.issues      || []),
      ...( providers.issues      || []),
      ...( reconciliation.issues || []),
      ...( settlements.issues    || []),
      ...( sysState.issues       || []),
    ];

    return {
      grade,
      score,
      timestamp:        new Date().toISOString(),
      components: {
        reserves:       { score: reserves.score,       issues: reserves.issues       || [] },
        liquidity:      { score: liquidity.score,      issues: liquidity.issues      || [] },
        providers:      { score: providers.score,      issues: providers.issues      || [] },
        reconciliation: { score: reconciliation.score, issues: reconciliation.issues || [] },
        settlements:    { score: settlements.score,    issues: settlements.issues    || [] },
        system_state:   { score: sysState.score,       issues: sysState.issues       || [] },
      },
      issues: allIssues,
    };
  }

  // ── Private Check Methods ─────────────────────────────────────────────────

  async _checkReserves() {
    const { data: ratios } = await supabase
      .from('reserve_ratios')
      .select('currency, reserve_ratio, status')
      .order('calculated_at', { ascending: false })
      .limit(16); // Latest 2 per currency (8 currencies)

    if (!ratios || ratios.length === 0) return { score: 50, issues: ['No reserve data available'] };

    const latest = {};
    for (const r of ratios) {
      if (!latest[r.currency]) latest[r.currency] = r;
    }

    const issues  = [];
    let minRatio  = 999;

    for (const [cur, r] of Object.entries(latest)) {
      if (r.reserve_ratio < minRatio) minRatio = r.reserve_ratio;
      if (r.status === 'CRITICAL' || r.status === 'DEFICIT') {
        issues.push(`${cur} reserve at ${r.reserve_ratio?.toFixed(2)}% [${r.status}]`);
      } else if (r.status === 'WARNING') {
        issues.push(`${cur} reserve at ${r.reserve_ratio?.toFixed(2)}% [WARNING]`);
      }
    }

    const score = Math.min(100, Math.max(0, minRatio > 200 ? 100 : Math.round(minRatio)));
    return { score, issues };
  }

  async _checkLiquidity() {
    const { data: recs } = await supabase
      .from('liquidity_recommendations')
      .select('severity, currency')
      .eq('status', 'OPEN');

    const issues = [];
    let deductions = 0;

    for (const r of (recs || [])) {
      if (r.severity === 'CRITICAL') {
        deductions += 30;
        issues.push(`Critical liquidity gap for ${r.currency}`);
      } else if (r.severity === 'WARN') {
        deductions += 15;
        issues.push(`Liquidity warning for ${r.currency}`);
      } else {
        deductions += 5;
      }
    }

    return { score: Math.max(0, 100 - deductions), issues };
  }

  async _checkProviderHealth() {
    const { data: providers } = await supabase
      .from('provider_health_status')
      .select('provider, status, circuit_breaker, consecutive_failures');

    const issues  = [];
    let deductions = 0;

    for (const p of (providers || [])) {
      if (p.circuit_breaker === 'OPEN') {
        deductions += 25;
        issues.push(`${p.provider} circuit OPEN (provider down)`);
      } else if (p.circuit_breaker === 'HALF_OPEN') {
        deductions += 10;
        issues.push(`${p.provider} circuit HALF_OPEN (recovering)`);
      } else if (p.status === 'DEGRADED') {
        deductions += 10;
        issues.push(`${p.provider} is DEGRADED`);
      }
    }

    return { score: Math.max(0, 100 - deductions), issues };
  }

  async _checkReconciliation() {
    const { data: discrepancies } = await supabase
      .from('reconciliation_reports')
      .select('discrepancy, status')
      .eq('status', 'discrepancy')
      .order('created_at', { ascending: false })
      .limit(10);

    const issues = [];
    const hasDiscrepancy = discrepancies && discrepancies.length > 0;

    if (hasDiscrepancy) {
      const maxDisc = Math.max(...discrepancies.map(d => Math.abs(parseFloat(d.discrepancy || 0))));
      issues.push(`${discrepancies.length} unresolved reconciliation discrepancies (max: ${maxDisc.toFixed(2)})`);
    }

    return { score: hasDiscrepancy ? Math.max(0, 100 - discrepancies.length * 15) : 100, issues };
  }

  async _checkSettlementBacklog() {
    const { count } = await supabase
      .from('settlements')
      .select('*', { count: 'exact', head: true })
      .in('current_stage', ['INITIATED', 'PROVIDER_PENDING', 'PROVIDER_CONFIRMED', 'LEDGER_POSTED']);

    const backlog = count || 0;
    const issues  = backlog > 50 ? [`Settlement backlog: ${backlog} pending items`] : [];
    const score   = backlog === 0 ? 100
      : backlog < 10  ? 90
      : backlog < 50  ? 70
      : 40;

    return { score, issues };
  }

  _checkSystemState() {
    const mode           = SystemState.mode;
    const withdrawalMode = SystemState.withdrawalMode || 'NORMAL';
    const issues = [];

    if (mode === 'SAFE')         issues.push('System is in SAFE_MODE');
    if (withdrawalMode === 'FROZEN')  issues.push('Withdrawals are FROZEN');
    if (withdrawalMode === 'DEGRADED') issues.push('Withdrawals are DEGRADED');

    const score = mode === 'SAFE'               ? 0
      : withdrawalMode === 'FROZEN'             ? 30
      : withdrawalMode === 'DEGRADED'           ? 60
      : 100;

    return { score, issues };
  }
}

module.exports = new TreasuryHealth();
