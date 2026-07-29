'use strict';
/**
 * ProviderHealthScorer.js
 * =======================
 * Calculates a 0–100 composite health score for every provider.
 * Replaces the binary HEALTHY/DOWN model with a continuous gradient.
 *
 * Component scores (each 0–100):
 *   latency_score         — P95 latency vs. configurable baseline
 *   success_rate_score    — 1-hour rolling success %
 *   webhook_delay_score   — Webhook P95 delivery delay
 *   error_rate_score      — API 4xx/5xx rate
 *   timeout_score         — Request timeout rate
 *   circuit_score         — CLOSED=100, HALF_OPEN=50, OPEN=0
 *   rate_limit_score      — Remaining rate limit headroom
 *
 * Composite = weighted average of all components.
 * GatewayRouter.setHealth() is called with grade derived from composite score.
 *
 * @module services/payment/ProviderHealthScorer
 */

const supabase     = require('../../config/database');
const logger       = require('../../utils/logger');
const GatewayRouter = require('./GatewayRouter');

// Weight per component (must sum to 1.0)
const WEIGHTS = {
  latency_score:       0.20,
  success_rate_score:  0.30,
  webhook_delay_score: 0.10,
  error_rate_score:    0.20,
  timeout_score:       0.10,
  circuit_score:       0.05,
  rate_limit_score:    0.05,
};

// Baseline thresholds
const LATENCY_BASELINE_MS      = 300;  // P95 latency considered "perfect"
const LATENCY_TERRIBLE_MS      = 5000; // P95 latency = score 0
const WEBHOOK_BASELINE_MS      = 5000;
const WEBHOOK_TERRIBLE_MS      = 60000;
const SUCCESS_RATE_FLOOR       = 70;   // Below this → score 0

// Grade thresholds for GatewayRouter compatibility
const GRADE_THRESHOLDS = {
  HEALTHY:  80,
  DEGRADED: 50,
  DOWN:     0,  // composite < 50 → DOWN
};

const ProviderHealthScorer = {
  /**
   * Compute health score for a single provider using recent probe data.
   * Returns the full score breakdown and updates provider_health_scores table.
   */
  async compute(providerKey) {
    const key = String(providerKey).toLowerCase();

    try {
      // Pull recent probe history (last 60 minutes)
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: probes } = await supabase
        .from('provider_health_probes')
        .select('success, latency_ms, probe_type, probed_at')
        .eq('provider', key)
        .gte('probed_at', since)
        .order('probed_at', { ascending: false });

      // Pull circuit breaker state
      const { data: circuitRow } = await supabase
        .from('provider_health_status')
        .select('circuit_breaker, avg_latency_ms, success_rate')
        .eq('provider', key)
        .maybeSingle();

      const allProbes     = probes || [];
      const totalProbes   = allProbes.length;
      const successProbes = allProbes.filter(p => p.success).length;
      const failedProbes  = totalProbes - successProbes;

      // ── Component: success_rate_score ──────────────────────────────────────
      const successRatePct = totalProbes > 0 ? (successProbes / totalProbes) * 100 : 100;
      const successRateScore = successRatePct < SUCCESS_RATE_FLOOR
        ? 0
        : Math.round(((successRatePct - SUCCESS_RATE_FLOOR) / (100 - SUCCESS_RATE_FLOOR)) * 100);

      // ── Component: latency_score ───────────────────────────────────────────
      const latencies  = allProbes.map(p => p.latency_ms || 0).filter(l => l > 0);
      const p95Latency = latencies.length > 0
        ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1]
        : (circuitRow?.avg_latency_ms || LATENCY_BASELINE_MS);

      const latencyScore = p95Latency <= LATENCY_BASELINE_MS ? 100
        : p95Latency >= LATENCY_TERRIBLE_MS ? 0
        : Math.round(100 - ((p95Latency - LATENCY_BASELINE_MS) / (LATENCY_TERRIBLE_MS - LATENCY_BASELINE_MS)) * 100);

      // ── Component: error_rate_score ────────────────────────────────────────
      const errorRatePct  = totalProbes > 0 ? (failedProbes / totalProbes) * 100 : 0;
      const errorRateScore = Math.round(Math.max(0, 100 - (errorRatePct * 5)));

      // ── Component: timeout_score ───────────────────────────────────────────
      const timeouts     = allProbes.filter(p => !p.success && (p.latency_ms || 0) > 8000).length;
      const timeoutRate  = totalProbes > 0 ? (timeouts / totalProbes) * 100 : 0;
      const timeoutScore = Math.round(Math.max(0, 100 - (timeoutRate * 10)));

      // ── Component: circuit_score ───────────────────────────────────────────
      const circuitState = circuitRow?.circuit_breaker || 'CLOSED';
      const circuitScore = circuitState === 'CLOSED' ? 100
        : circuitState === 'HALF_OPEN' ? 50 : 0;

      // ── Component: webhook_delay_score ─────────────────────────────────────
      // Approximated from probe latency until webhook-specific probes are available
      const webhookDelayScore = Math.round(Math.min(100, (WEBHOOK_BASELINE_MS / Math.max(p95Latency * 10, 1)) * 100));

      // ── Component: rate_limit_score ────────────────────────────────────────
      // Default 100 until rate limit headers are parsed from probes
      const rateLimitScore = 100;

      // ── Composite ─────────────────────────────────────────────────────────
      const composite = Math.round(
        successRateScore  * WEIGHTS.success_rate_score  +
        latencyScore      * WEIGHTS.latency_score       +
        errorRateScore    * WEIGHTS.error_rate_score    +
        timeoutScore      * WEIGHTS.timeout_score       +
        circuitScore      * WEIGHTS.circuit_score       +
        webhookDelayScore * WEIGHTS.webhook_delay_score +
        rateLimitScore    * WEIGHTS.rate_limit_score
      );

      const breakdown = {
        latency_score:       latencyScore,
        success_rate_score:  successRateScore,
        webhook_delay_score: webhookDelayScore,
        error_rate_score:    errorRateScore,
        timeout_score:       timeoutScore,
        circuit_score:       circuitScore,
        rate_limit_score:    rateLimitScore,
        composite_score:     composite,
        p95_latency_ms:      p95Latency,
        success_rate_1h:     parseFloat(successRatePct.toFixed(2)),
        error_rate_1h:       parseFloat(errorRatePct.toFixed(2)),
        timeout_rate_1h:     parseFloat(timeoutRate.toFixed(2)),
        total_requests_1h:   totalProbes,
        circuit_state:       circuitState,
        routing_weight:      parseFloat((composite / 100).toFixed(3)),
        computed_at:         new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      };

      // ── Persist ───────────────────────────────────────────────────────────
      await supabase
        .from('provider_health_scores')
        .upsert({ provider: key, ...breakdown }, { onConflict: 'provider' })
        .catch(e => logger.warn(`[HealthScorer] DB upsert failed for ${key}: ${e.message}`));

      // ── Historical snapshot ───────────────────────────────────────────────
      await supabase
        .from('provider_health_score_history')
        .insert({
          provider:          key,
          composite_score:   composite,
          latency_score:     latencyScore,
          success_rate_score: successRateScore,
          circuit_state:     circuitState,
          p95_latency_ms:    p95Latency,
          success_rate_1h:   parseFloat(successRatePct.toFixed(2)),
        })
        .catch(() => {});

      // ── Update GatewayRouter ──────────────────────────────────────────────
      const gatewayGrade = composite >= GRADE_THRESHOLDS.HEALTHY ? 'HEALTHY'
        : composite >= GRADE_THRESHOLDS.DEGRADED ? 'DEGRADED' : 'DOWN';
      GatewayRouter.setHealth(key, gatewayGrade);

      logger.info(`[HealthScorer] ${key}: score=${composite} (${gatewayGrade}) | latency=${latencyScore} success=${successRateScore} circuit=${circuitScore}`);
      return { provider: key, ...breakdown };

    } catch (err) {
      logger.error(`[HealthScorer] compute failed for ${key}: ${err.message}`);
      return { provider: key, composite_score: 50, error: err.message };
    }
  },

  /**
   * Compute scores for all known providers.
   */
  async computeAll() {
    const PROVIDERS = ['fincra', 'anchor', 'paystack', 'grey', 'nowpayments'];
    const results = {};
    for (const p of PROVIDERS) {
      results[p] = await this.compute(p);
    }
    return results;
  },

  /**
   * Get latest stored scores from DB (fast — no computation).
   */
  async getLatestScores() {
    const { data } = await supabase
      .from('provider_health_scores')
      .select('*')
      .order('provider');
    return data || [];
  },

  /**
   * Get composite score for routing (0–100). Returns cached value.
   */
  async getScore(providerKey) {
    const { data } = await supabase
      .from('provider_health_scores')
      .select('composite_score, circuit_state')
      .eq('provider', String(providerKey).toLowerCase())
      .maybeSingle();
    return data?.composite_score ?? 100;
  },

  GRADE_THRESHOLDS,
  WEIGHTS,
};

module.exports = ProviderHealthScorer;
