'use strict';
/**
 * ProviderSLAService.js
 * =====================
 * Tracks Provider SLA metrics: uptime %, avg latency, success rate,
 * webhook delay, MTTR, and error budget consumption.
 *
 * Updates provider_sla_metrics on hourly and daily intervals.
 * Called by SLAMetricsWorker.
 *
 * @module services/treasury/ProviderSLAService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const ALL_PROVIDERS   = ['fincra', 'anchor', 'paystack', 'grey', 'nowpayments'];
const DEFAULT_SLA_PCT = 99.9;

// Error budget = time allowed to be down per month
// 99.9% SLA → 0.1% × 30 days × 24h × 60m = 43.2 minutes/month
const errorBudgetMinutes = (slaPct) => (100 - slaPct) / 100 * 30 * 24 * 60;

const ProviderSLAService = {
  /**
   * Compute and persist SLA metrics for all providers for a given period.
   * @param {Date}   periodStart
   * @param {Date}   periodEnd
   * @param {string} periodType   - HOURLY | DAILY
   */
  async computeAll(periodStart, periodEnd, periodType = 'HOURLY') {
    const results = {};
    for (const provider of ALL_PROVIDERS) {
      results[provider] = await this.computeForProvider(provider, periodStart, periodEnd, periodType);
    }
    return results;
  },

  /**
   * Compute SLA metrics for one provider over a time window.
   */
  async computeForProvider(provider, periodStart, periodEnd, periodType = 'HOURLY') {
    const key = String(provider).toLowerCase();

    // ── Probe data ─────────────────────────────────────────────────────────────
    const { data: probes } = await supabase
      .from('provider_health_probes')
      .select('success, latency_ms, probed_at')
      .eq('provider', key)
      .gte('probed_at', periodStart.toISOString())
      .lte('probed_at', periodEnd.toISOString());

    const allProbes      = probes || [];
    const totalRequests  = allProbes.length;
    const successfulReqs = allProbes.filter(p => p.success).length;
    const failedReqs     = totalRequests - successfulReqs;
    const timeouts       = allProbes.filter(p => !p.success && (p.latency_ms || 0) > 8000).length;

    // ── Latency percentiles ────────────────────────────────────────────────────
    const latencies = allProbes
      .filter(p => p.success && p.latency_ms)
      .map(p => p.latency_ms)
      .sort((a, b) => a - b);

    const pct = (n) => latencies.length > 0
      ? latencies[Math.floor(latencies.length * n / 100)] || 0
      : null;

    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length)
      : null;

    // ── Uptime ─────────────────────────────────────────────────────────────────
    const uptimePct = totalRequests > 0
      ? parseFloat(((successfulReqs / totalRequests) * 100).toFixed(3))
      : 100;

    const durationMinutes = (periodEnd - periodStart) / 60000;
    const downtimeMinutes = durationMinutes * (1 - uptimePct / 100);

    // ── SLA target from DB ─────────────────────────────────────────────────────
    const { data: slaConfig } = await supabase
      .from('banking_providers')
      .select('sla_uptime_pct')
      .eq('provider_key', key)
      .maybeSingle();

    const slaTarget       = parseFloat(slaConfig?.sla_uptime_pct || DEFAULT_SLA_PCT);
    const budgetMinutes   = errorBudgetMinutes(slaTarget);
    const budgetUsedPct   = downtimeMinutes > 0
      ? parseFloat(((downtimeMinutes / budgetMinutes) * 100).toFixed(3))
      : 0;
    const budgetRemaining = parseFloat(Math.max(0, 100 - budgetUsedPct).toFixed(3));
    const slaBreach       = uptimePct < slaTarget;

    // ── MTTR (Mean Time to Recovery) ──────────────────────────────────────────
    // Approximate: avg duration of failure sequences
    let mttrMinutes = null;
    if (totalRequests > 0 && failedReqs > 0) {
      const failureDuration = durationMinutes * (failedReqs / totalRequests);
      const incidentCount   = this._countIncidents(allProbes);
      mttrMinutes = incidentCount > 0
        ? parseFloat((failureDuration / incidentCount).toFixed(2))
        : null;
    }

    const metrics = {
      provider:            key,
      period_start:        periodStart.toISOString(),
      period_end:          periodEnd.toISOString(),
      period_type:         periodType,
      uptime_pct:          uptimePct,
      downtime_minutes:    parseFloat(downtimeMinutes.toFixed(2)),
      incidents_count:     totalRequests > 0 ? this._countIncidents(allProbes) : 0,
      avg_latency_ms:      avgLatency,
      p50_latency_ms:      pct(50),
      p95_latency_ms:      pct(95),
      p99_latency_ms:      pct(99),
      total_requests:      totalRequests,
      successful_requests: successfulReqs,
      failed_requests:     failedReqs,
      timeout_requests:    timeouts,
      mttr_minutes:        mttrMinutes,
      error_budget_pct:    budgetRemaining,
      sla_target_pct:      slaTarget,
      sla_breached:        slaBreach,
    };

    // Persist
    await supabase
      .from('provider_sla_metrics')
      .upsert(metrics, { onConflict: 'provider,period_start,period_type' })
      .catch(e => logger.warn(`[ProviderSLA] Persist failed for ${key}: ${e.message}`));

    if (slaBreach) {
      logger.warn(`[ProviderSLA] SLA BREACH: ${key} uptime=${uptimePct}% (target: ${slaTarget}%)`);
    }

    return metrics;
  },

  /**
   * Get SLA dashboard data for all providers.
   */
  async getDashboard(periodType = 'DAILY') {
    const { data } = await supabase
      .from('provider_sla_metrics')
      .select('*')
      .eq('period_type', periodType)
      .order('period_start', { ascending: false })
      .limit(50);

    if (!data) return [];

    // Dedupe to most recent per provider
    const seen = new Set();
    return data.filter(m => {
      if (seen.has(m.provider)) return false;
      seen.add(m.provider);
      return true;
    });
  },

  /**
   * Count distinct failure incidents (runs of consecutive failures).
   */
  _countIncidents(probes) {
    let incidents  = 0;
    let inFailure  = false;
    for (const p of probes) {
      if (!p.success && !inFailure) { incidents++; inFailure = true; }
      if (p.success) inFailure = false;
    }
    return incidents;
  },
};

module.exports = ProviderSLAService;
