'use strict';
/**
 * MultiProviderReserveEngine.js
 * =============================
 * Aggregates balances from ALL providers into a combined reserve ratio
 * per currency. Replaces single-provider reserve calculations.
 *
 * Formula:
 *   Total Assets    = SUM(provider_balances WHERE currency = X AND sync_status = 'SUCCESS')
 *   Total Liability = SUM(wallets_v6.balance WHERE currency = X AND network != 'SYSTEM')
 *   Reserve Ratio   = Total Assets / Total Liability × 100
 *
 * Both aggregated (combined) and per-provider ratios are calculated.
 * Aggregated ratio is the primary reserve metric.
 * Per-provider ratios expose concentration risk.
 *
 * @module services/treasury/MultiProviderReserveEngine
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// Supported currencies (fiat + crypto)
const ALL_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT', 'USDC'];

// Provider & Currency Specific Freshness TTL Hierarchy
// QUIDAX GUARD: Quidax is intentionally excluded from TTL_MAP_MS pending official balance API & TTL freshness docs.
// Until verified, QUIDAX = NOT_ELIGIBLE_FOR_RESERVE_ASSERTION (filterEligibleBalances will return false for Quidax).
const TTL_MAP_MS = {
  FINCRA:      { NGN: 15 * 60 * 1000 },
  ANCHOR:      { USD: 15 * 60 * 1000 },
  NOWPAYMENTS: { BTC: 30 * 60 * 1000, ETH: 30 * 60 * 1000, USDT: 30 * 60 * 1000, USDC: 30 * 60 * 1000 }
};
const DEFAULT_TTL_MS = 15 * 60 * 1000;

/**
 * Pure Fail-Closed Layer 8 Freshness Oracle & Provider Health Filter
 * Formally Enforces Contract Option B (Canonical Health States ONLINE & HEALTHY):
 *   1. Known Provider & Currency in TTL Hierarchy
 *   2. sync_status === 'SUCCESS'
 *   3. last_synced_at is finite, non-null, non-future, and within TTL
 *   4. Normalized Provider Health === 'ONLINE' or 'HEALTHY' (Fail-closed on DEGRADED/OFFLINE/UNAVAILABLE/UNKNOWN)
 *   5. available_balance is finite and non-negative (>= 0)
 *
 * @param {Array} allBalances - Raw custody rows from DB
 * @param {Object} providerHealthMap - Map of health statuses (e.g. { FINCRA: 'ONLINE' })
 * @param {Function} [nowFn=Date.now] - Injectable clock for deterministic testing
 * @returns {Array} Admissible eligible balance records
 */
function filterEligibleBalances(allBalances, providerHealthMap = {}, nowFn = Date.now) {
  const normalizedHealthMap = {};
  for (const [k, v] of Object.entries(providerHealthMap || {})) {
    normalizedHealthMap[String(k).trim().toUpperCase()] = String(v || '').trim().toUpperCase();
  }

  const now = nowFn();

  return (allBalances || []).filter(b => {
    const providerKey = String(b.provider || '').trim().toUpperCase();
    const currencyKey = String(b.currency || '').trim().toUpperCase();

    // Criterion 1: Fail-closed on unknown provider / currency
    const providerTtls = TTL_MAP_MS[providerKey];
    if (!providerTtls) return false;

    const ttl = providerTtls[currencyKey];
    if (!ttl) return false;

    // Criterion 2: Fail-closed on non-SUCCESS sync status
    if (b.sync_status !== 'SUCCESS') return false;

    // Criterion 3: Timestamp MUST be finite, non-null, non-future, and within TTL
    const rawTs = b.last_synced_at || b.last_sync_at;
    const syncedAt = rawTs ? new Date(rawTs).getTime() : NaN;
    if (!Number.isFinite(syncedAt)) return false;

    const ageMs = now - syncedAt;
    if (ageMs < 0 || ageMs > ttl) return false;

    // Criterion 4: Normalized Provider Health MUST be ONLINE / HEALTHY
    const rawHealth = normalizedHealthMap[providerKey] || 'OFFLINE';
    const isHealthy = rawHealth === 'ONLINE' || rawHealth === 'HEALTHY';
    if (!isHealthy) return false;

    // Criterion 5: Balance MUST be finite and non-negative
    const available = Number(b.available_balance);
    if (!Number.isFinite(available) || available < 0) return false;

    return true;
  });
}

const MultiProviderReserveEngine = {
  // Export filter for direct unit testing
  filterEligibleBalances,
  TTL_MAP_MS,

  /**
   * Helper to fetch current provider health status map from DB.
   */
  async fetchProviderHealthMap() {
    try {
      const { data } = await supabase
        .from('provider_health_status')
        .select('provider, status');

      const healthMap = {};
      for (const row of (data || [])) {
        const key = String(row.provider || '').trim().toUpperCase();
        const val = String(row.status || '').trim().toUpperCase();
        healthMap[key] = val;
      }
      return healthMap;
    } catch (e) {
      logger.warn(`[MultiReserveEngine] Failed to fetch provider health status: ${e.message}`);
      return {};
    }
  },

  /**
   * Compute reserve ratios for all currencies.
   * @returns {Promise<Object>} keyed by currency
   */
  async computeAll(options = {}) {
    const results = {};
    for (const currency of ALL_CURRENCIES) {
      results[currency] = await this.computeForCurrency(currency, options);
    }
    return results;
  },

  /**
   * Compute aggregated + per-provider reserve ratios for one currency.
   * Enforces Layer 8 Fail-Closed Oracle Filter.
   */
  async computeForCurrency(currency, options = {}) {
    const up = String(currency).toUpperCase();
    const nowFn = options.nowFn || Date.now;

    // Resolve Provider Health Map
    const healthMap = options.providerHealthMap || await this.fetchProviderHealthMap();

    // ── Total external assets (all providers) ─────────────────────────────────
    const { data: balances } = await supabase
      .from('treasury_provider_balances')
      .select('*')
      .eq('currency', up);

    const allBalances = balances || [];
    
    // Apply Layer 8 Freshness Oracle & Provider Health Filter
    const syncedBalances = filterEligibleBalances(allBalances, healthMap, nowFn);

    const eligibleKeys = new Set(syncedBalances.map(b => String(b.provider).toUpperCase()));
    const failedProviders = allBalances
      .filter(b => !eligibleKeys.has(String(b.provider).toUpperCase()))
      .map(b => b.provider);

    const totalAssets = syncedBalances.reduce(
      (sum, b) => sum + parseFloat(b.available_balance || 0), 0
    );

    const totalPending = syncedBalances.reduce(
      (sum, b) => sum + parseFloat(b.pending_balance || 0), 0
    );

    // ── Total user liability (excluding SYSTEM wallets) ────────────────────────
    const { data: liabilityData } = await supabase
      .from('wallets_v6')
      .select('balance')
      .eq('currency', up)
      .neq('network', 'SYSTEM');

    const totalLiability = (liabilityData || []).reduce(
      (sum, w) => sum + parseFloat(w.balance || 0), 0
    );

    // ── Aggregated ratio ──────────────────────────────────────────────────────
    const reserveRatio = totalLiability > 0
      ? parseFloat(((totalAssets / totalLiability) * 100).toFixed(4))
      : totalAssets > 0 ? 999 : 0;

    // ── Per-provider breakdown ────────────────────────────────────────────────
    const providerBreakdown = syncedBalances.map(b => {
      const available = parseFloat(b.available_balance || 0);
      return {
        provider:       b.provider,
        available,
        pending:        parseFloat(b.pending_balance || 0),
        pct_of_total:   totalAssets > 0 ? parseFloat(((available / totalAssets) * 100).toFixed(2)) : 0,
        coverage_ratio: totalLiability > 0 ? parseFloat(((available / totalLiability) * 100).toFixed(4)) : 999,
        last_synced_at: b.last_synced_at,
      };
    });

    // ── Concentration risk ────────────────────────────────────────────────────
    const maxConcentration = providerBreakdown.reduce(
      (max, p) => Math.max(max, p.pct_of_total), 0
    );
    const concentrationRisk = maxConcentration > 80 ? 'HIGH'
      : maxConcentration > 60 ? 'MEDIUM' : 'LOW';

    // ── Health status & Color ──────────────────────────────────────────────────
    const status = reserveRatio >= 105 ? 'HEALTHY'
      : reserveRatio >= 100 ? 'WARN'
      : reserveRatio >= 95  ? 'CRITICAL'
      : 'EMERGENCY';

    const statusColor = reserveRatio >= 100 ? 'GREEN'
      : reserveRatio >= 95 ? 'YELLOW'
      : 'RED';

    const result = {
      currency:            up,
      total_assets:        parseFloat(totalAssets.toFixed(8)),
      total_pending:       parseFloat(totalPending.toFixed(8)),
      total_liability:     parseFloat(totalLiability.toFixed(8)),
      reserve_ratio:       reserveRatio,
      status,
      status_color:        statusColor,
      concentration_risk:  concentrationRisk,
      max_concentration:   maxConcentration,
      provider_count:      syncedBalances.length,
      failed_providers:    failedProviders,
      provider_breakdown:  providerBreakdown,
      computed_at:         new Date().toISOString(),
    };

    // ── Persist to reserve_ratios ─────────────────────────────────────────────
    try {
      await supabase
        .from('reserve_ratios')
        .insert({
          currency:        up,
          reserve_ratio:   reserveRatio,
          total_assets:    totalAssets,
          total_liability: totalLiability,
          status,
          computed_at:     new Date().toISOString(),
        });
    } catch (e) {
      logger.warn(`[MultiReserve] Failed to persist ratio for ${up}: ${e.message}`);
    }

    return result;
  },

  /**
   * Get the latest reserve ratios from DB (fast — no computation).
   */
  async getLatestRatios() {
    // Get most recent entry per currency
    const { data } = await supabase
      .from('reserve_ratios')
      .select('*')
      .order('computed_at', { ascending: false })
      .limit(50);

    if (!data) return [];

    // Dedupe to most recent per currency
    const seen = new Set();
    return data.filter(r => {
      if (seen.has(r.currency)) return false;
      seen.add(r.currency);
      return true;
    });
  },

  /**
   * Admin endpoint: Customer Balance Proof per currency.
   * Total customer liabilities vs. total external assets per provider.
   */
  async getBalanceProof() {
    const proof = {};

    for (const currency of ALL_CURRENCIES) {
      const ratio = await this.computeForCurrency(currency);

      proof[currency] = {
        currency,
        total_customer_balance: ratio.total_liability,
        total_external_assets:  ratio.total_assets,
        difference:             parseFloat((ratio.total_assets - ratio.total_liability).toFixed(8)),
        reserve_ratio:          ratio.reserve_ratio,
        status:                 ratio.status,
        status_color:           ratio.status_color,
        provider_breakdown:     ratio.provider_breakdown,
        timestamp:              ratio.computed_at,
      };
    }

    return proof;
  },
  /**
   * [Phase 17] Enforce provider exposure limits.
   * Reads max_exposure_pct from banking_providers table.
   * Returns violations where a provider's share of total treasury exceeds its ceiling.
   *
   * @param {string} [currency] - If omitted, checks all FIAT_CURRENCIES
   * @returns {Promise<{ violations: Array, summary: Object }>}
   */
  async enforceExposureLimits(currency) {
    const currencies = currency ? [String(currency).toUpperCase()] : FIAT_CURRENCIES;
    const violations = [];
    const summary    = {};

    // Load exposure ceilings from DB
    const { data: providers } = await supabase
      .from('banking_providers')
      .select('provider_name, max_exposure_pct, is_active')
      .eq('is_active', true);

    // Default: 40% ceiling per provider if not configured in DB
    const ceilingMap = {};
    for (const p of (providers || [])) {
      ceilingMap[p.provider_name] = parseFloat(p.max_exposure_pct ?? 40);
    }

    for (const cur of currencies) {
      const ratio = await this.computeForCurrency(cur);
      const breakdown = ratio.provider_breakdown || [];

      const curViolations = [];
      for (const p of breakdown) {
        const ceiling = ceilingMap[p.provider] ?? 40;
        if (p.pct_of_total > ceiling) {
          curViolations.push({
            provider:     p.provider,
            current_pct:  p.pct_of_total,
            ceiling_pct:  ceiling,
            overage_pct:  parseFloat((p.pct_of_total - ceiling).toFixed(2)),
            available:    p.available,
            currency:     cur,
            severity:     p.pct_of_total > (ceiling * 1.25) ? 'CRITICAL' : 'WARNING',
          });
        }
      }

      violations.push(...curViolations);
      summary[cur] = {
        provider_count:      breakdown.length,
        violations:          curViolations.length,
        max_concentration:   ratio.max_concentration,
        concentration_risk:  ratio.concentration_risk,
      };
    }

    // Persist violations as rebalancing recommendations
    for (const v of violations) {
      await supabase.from('rebalancing_recommendations').insert({
        provider:    v.provider,
        currency:    v.currency,
        reason:      `Exposure limit breach: ${v.current_pct}% > ${v.ceiling_pct}% ceiling`,
        severity:    v.severity,
        recommended_action: `Reduce ${v.provider} exposure from ${v.current_pct}% to below ${v.ceiling_pct}%`,
        status:      'PENDING',
        metadata:    v,
        created_at:  new Date().toISOString(),
      }).catch(() => null);
    }

    logger.info(`[MultiReserveEngine] Exposure check: ${violations.length} violation(s) across ${currencies.join(', ')}`);
    return { violations, summary };
  },
};

module.exports = MultiProviderReserveEngine;
