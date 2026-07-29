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

const MultiProviderReserveEngine = {
  /**
   * Compute reserve ratios for all currencies.
   * @returns {Promise<Object>} keyed by currency
   */
  async computeAll() {
    const results = {};
    for (const currency of ALL_CURRENCIES) {
      results[currency] = await this.computeForCurrency(currency);
    }
    return results;
  },

  /**
   * Compute aggregated + per-provider reserve ratios for one currency.
   */
  async computeForCurrency(currency) {
    const up = String(currency).toUpperCase();

    // ── Total external assets (all providers) ─────────────────────────────────
    const { data: balances } = await supabase
      .from('treasury_provider_balances')
      .select('provider, available_balance, pending_balance, sync_status, last_synced_at')
      .eq('currency', up);

    const allBalances     = balances || [];
    const syncedBalances  = allBalances.filter(b => b.sync_status === 'SUCCESS');
    const failedProviders = allBalances.filter(b => b.sync_status !== 'SUCCESS').map(b => b.provider);

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
