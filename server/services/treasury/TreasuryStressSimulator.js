'use strict';
/**
 * TreasuryStressSimulator.js
 * ==========================
 * Runs what-if treasury stress scenarios against live reserve data.
 * Answers: "What happens to our reserve ratio if X happens?"
 *
 * Built-in scenarios:
 *   PROVIDER_FAILURE     - A provider goes offline (remove its balance)
 *   MASS_WITHDRAWAL      - X% of user liabilities are redeemed simultaneously
 *   FX_SHOCK             - Currency depreciates by Y%
 *   CONCENTRATION_BREACH - One provider holds Z% of reserves (single-point failure)
 *   COMBINED             - All of the above simultaneously
 *
 * All scenarios are read-only (never modify live data).
 * Results are persisted to `treasury_stress_results` for historical analysis.
 *
 * @module services/treasury/TreasuryStressSimulator
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// Lazy to avoid circular
const _reserveEngine = () => require('./MultiProviderReserveEngine');

const TreasuryStressSimulator = {

  /**
   * Run all standard stress scenarios for a currency.
   * @param {string} currency
   * @param {Object} [overrides]  Custom scenario parameters
   * @returns {Promise<StressReport>}
   */
  async runAll(currency, overrides = {}) {
    const up = String(currency).toUpperCase();
    logger.info(`[StressSimulator] Running full stress suite for ${up}`);

    const base = await _reserveEngine().computeForCurrency(up);

    const [
      providerFailure,
      massWithdrawal,
      fxShock,
      concentrationBreach,
      combined,
    ] = await Promise.all([
      this.scenarioProviderFailure(base, overrides.failedProvider),
      this.scenarioMassWithdrawal(base, overrides.withdrawalPct ?? 30),
      this.scenarioFXShock(base, overrides.fxDepreciationPct ?? 20),
      this.scenarioConcentrationBreach(base, overrides.concentrationPct ?? 80),
      this.scenarioCombined(base, overrides),
    ]);

    const report = {
      currency:       up,
      simulated_at:   new Date().toISOString(),
      baseline: {
        reserve_ratio:  base.reserve_ratio,
        status:         base.status,
        total_assets:   base.total_assets,
        total_liability: base.total_liability,
      },
      scenarios: {
        provider_failure:      providerFailure,
        mass_withdrawal:       massWithdrawal,
        fx_shock:              fxShock,
        concentration_breach:  concentrationBreach,
        combined,
      },
      worst_case_ratio:  Math.min(
        providerFailure.simulated_ratio,
        massWithdrawal.simulated_ratio,
        fxShock.simulated_ratio,
        concentrationBreach.simulated_ratio,
        combined.simulated_ratio,
      ),
      recommendation: null,
    };

    report.recommendation = this._generateRecommendation(report);

    // Persist for historical analysis
    await supabase.from('treasury_stress_results').insert({
      currency:       up,
      report:         report,
      simulated_at:   report.simulated_at,
    }).catch(() => null);

    return report;
  },

  /**
   * Scenario 1: One provider goes offline.
   * Removes the largest (or specified) provider's balance.
   */
  async scenarioProviderFailure(base, failedProvider) {
    const breakdown = base.provider_breakdown || [];

    // Target: specified provider, or the one with highest balance
    const target = failedProvider
      ? breakdown.find(p => p.provider === failedProvider)
      : breakdown.reduce((max, p) => (p.available > (max?.available || 0) ? p : max), null);

    if (!target) {
      return { scenario: 'PROVIDER_FAILURE', simulated_ratio: base.reserve_ratio, delta: 0, impact: 'NONE', note: 'No provider found' };
    }

    const simulatedAssets = base.total_assets - target.available;
    const ratio = base.total_liability > 0
      ? parseFloat(((simulatedAssets / base.total_liability) * 100).toFixed(2))
      : simulatedAssets > 0 ? 999 : 0;

    return {
      scenario:          'PROVIDER_FAILURE',
      failed_provider:   target.provider,
      assets_removed:    target.available,
      simulated_assets:  simulatedAssets,
      simulated_ratio:   ratio,
      delta:             parseFloat((ratio - base.reserve_ratio).toFixed(2)),
      impact:            this._rateImpact(ratio),
      status:            this._ratioStatus(ratio),
    };
  },

  /**
   * Scenario 2: Mass withdrawal — X% of liabilities redeemed at once.
   */
  async scenarioMassWithdrawal(base, withdrawalPct = 30) {
    const additionalDrain = base.total_liability * (withdrawalPct / 100);
    const simulatedLiability = base.total_liability + additionalDrain;

    const ratio = simulatedLiability > 0
      ? parseFloat(((base.total_assets / simulatedLiability) * 100).toFixed(2))
      : 999;

    return {
      scenario:             'MASS_WITHDRAWAL',
      withdrawal_pct:       withdrawalPct,
      additional_liability: parseFloat(additionalDrain.toFixed(8)),
      simulated_liability:  parseFloat(simulatedLiability.toFixed(8)),
      simulated_ratio:      ratio,
      delta:                parseFloat((ratio - base.reserve_ratio).toFixed(2)),
      impact:               this._rateImpact(ratio),
      status:               this._ratioStatus(ratio),
    };
  },

  /**
   * Scenario 3: FX shock — currency depreciates by Y%.
   * Reduces the value of non-base-currency assets.
   */
  async scenarioFXShock(base, depreciationPct = 20) {
    const multiplier      = 1 - (depreciationPct / 100);
    const simulatedAssets = base.total_assets * multiplier;

    const ratio = base.total_liability > 0
      ? parseFloat(((simulatedAssets / base.total_liability) * 100).toFixed(2))
      : simulatedAssets > 0 ? 999 : 0;

    return {
      scenario:          'FX_SHOCK',
      depreciation_pct:  depreciationPct,
      simulated_assets:  parseFloat(simulatedAssets.toFixed(8)),
      simulated_ratio:   ratio,
      delta:             parseFloat((ratio - base.reserve_ratio).toFixed(2)),
      impact:            this._rateImpact(ratio),
      status:            this._ratioStatus(ratio),
    };
  },

  /**
   * Scenario 4: Single provider holds Z% of reserves.
   * Models what happens when concentration is artificially extreme.
   */
  async scenarioConcentrationBreach(base, concentrationPct = 80) {
    // Simulate: top provider holds `concentrationPct`% and then fails
    const concentratedAmount = base.total_assets * (concentrationPct / 100);
    const simulatedAssets    = base.total_assets - concentratedAmount;

    const ratio = base.total_liability > 0
      ? parseFloat(((simulatedAssets / base.total_liability) * 100).toFixed(2))
      : simulatedAssets > 0 ? 999 : 0;

    return {
      scenario:             'CONCENTRATION_BREACH',
      concentration_pct:    concentrationPct,
      concentrated_amount:  parseFloat(concentratedAmount.toFixed(8)),
      simulated_assets:     parseFloat(simulatedAssets.toFixed(8)),
      simulated_ratio:      ratio,
      delta:                parseFloat((ratio - base.reserve_ratio).toFixed(2)),
      impact:               this._rateImpact(ratio),
      status:               this._ratioStatus(ratio),
    };
  },

  /**
   * Scenario 5: All shocks simultaneously.
   */
  async scenarioCombined(base, overrides = {}) {
    const withdrawalPct    = overrides.withdrawalPct    ?? 30;
    const depreciationPct  = overrides.fxDepreciationPct ?? 20;

    // Lose largest provider + FX shock on remainder + mass withdrawal
    const breakdown     = base.provider_breakdown || [];
    const topProvider   = breakdown.reduce((max, p) => (p.available > (max?.available || 0) ? p : max), null);
    const lostAssets    = topProvider?.available || 0;

    const assetsAfterFailure = (base.total_assets - lostAssets) * (1 - depreciationPct / 100);
    const simulatedLiability = base.total_liability * (1 + withdrawalPct / 100);

    const ratio = simulatedLiability > 0
      ? parseFloat(((assetsAfterFailure / simulatedLiability) * 100).toFixed(2))
      : 999;

    return {
      scenario:            'COMBINED',
      failed_provider:     topProvider?.provider || 'none',
      assets_after_shock:  parseFloat(assetsAfterFailure.toFixed(8)),
      withdrawal_pct:      withdrawalPct,
      depreciation_pct:    depreciationPct,
      simulated_ratio:     ratio,
      delta:               parseFloat((ratio - base.reserve_ratio).toFixed(2)),
      impact:              this._rateImpact(ratio),
      status:              this._ratioStatus(ratio),
    };
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _ratioStatus(ratio) {
    if (ratio >= 105) return 'HEALTHY';
    if (ratio >= 100) return 'WARN';
    if (ratio >= 95)  return 'CRITICAL';
    return 'EMERGENCY';
  },

  _rateImpact(ratio) {
    if (ratio >= 105) return 'LOW';
    if (ratio >= 100) return 'MEDIUM';
    if (ratio >= 90)  return 'HIGH';
    return 'CRITICAL';
  },

  _generateRecommendation(report) {
    const worstRatio = report.worst_case_ratio;
    if (worstRatio < 90) {
      return 'IMMEDIATE ACTION REQUIRED: Worst-case scenario results in EMERGENCY reserve state. Increase reserves or reduce concentration risk.';
    }
    if (worstRatio < 100) {
      return 'WARNING: At least one stress scenario produces a sub-100% reserve ratio. Consider increasing treasury buffers.';
    }
    if (worstRatio < 105) {
      return 'CAUTION: Stress scenarios approach the minimum reserve threshold. Monitor provider concentration.';
    }
    return 'Reserve position is resilient across all simulated stress scenarios.';
  },
};

module.exports = TreasuryStressSimulator;
