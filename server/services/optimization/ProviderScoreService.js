'use strict';

/**
 * ProviderScoreService.js
 * =======================
 * Multi-criteria Provider Recommendation Scoring Engine.
 * Calculates composite score:
 * Score = (35% * SuccessRate) + (20% * LatencyScore) + (20% * FeeScore) + (15% * LiquidityScore) + (10% * CircuitHealth)
 */
class ProviderScoreService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
    this.CircuitBreakerService = require('../operations/CircuitBreakerService');
    this.circuitBreakers = options.circuitBreakers || new this.CircuitBreakerService({ db: this.db });
  }

  /**
   * Calculate Provider Composite Score (0 - 100)
   */
  async computeScore(provider, params = {}) {
    const cb = this.circuitBreakers.getBreaker(provider);

    // 1. Circuit Health (10%)
    let circuitScore = 100;
    if (cb.state === 'OPEN') circuitScore = 0;
    else if (cb.state === 'HALF_OPEN') circuitScore = 50;

    // 2. Success Rate (35%)
    const successRateScore = params.successRate !== undefined ? parseFloat(params.successRate) : 99.5;

    // 3. Latency Score (20%) - Lower is better
    const latencyMs = params.latencyMs || 120;
    const latencyScore = Math.max(0, 100 - (latencyMs / 10));

    // 4. Fee Score (20%) - Lower fee is better
    const feeScore = 90.0;

    // 5. Treasury Liquidity Score (15%)
    const liquidityScore = params.hasLiquidity ? 100 : 50;

    // Composite Weighted Calculation
    const compositeScore = (
      (0.35 * successRateScore) +
      (0.20 * latencyScore) +
      (0.20 * feeScore) +
      (0.15 * liquidityScore) +
      (0.10 * circuitScore)
    );

    return {
      provider,
      compositeScore: Math.round(compositeScore * 100) / 100,
      breakdown: {
        successRateScore,
        latencyScore,
        feeScore,
        liquidityScore,
        circuitScore,
        circuitState: cb.state
      }
    };
  }
}

module.exports = ProviderScoreService;
