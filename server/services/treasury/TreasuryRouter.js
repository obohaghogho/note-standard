'use strict';

/**
 * TreasuryRouter.js
 * =================
 * Dynamic Multi-Criteria Weighted Scoring & Failover Router for NoteStandard.
 *
 * Replaces static priority lists with a dynamic weighted scoring algorithm.
 * Evaluates candidate providers across 5 dimensions:
 *   1. Health Score (weight 25%)      - Circuit breaker state & uptime
 *   2. Available Liquidity (weight 25%)- Net available liquidity margin
 *   3. Fee & Cost Score (weight 20%)   - Transaction fee & FX cost competitiveness
 *   4. Settlement Speed (weight 15%)   - Historical payout latency
 *   5. Risk & Compliance (weight 15%)  - Provider regulatory & SLA rating
 *
 * Multi-Tier Failover: Primary -> Secondary -> Fallback -> Retry Queue.
 * Zero hardcoded provider priorities!
 *
 * @module services/treasury/TreasuryRouter
 */

const adapterRegistry = require('./adapters/AdapterRegistry');
const liquidityManager = require('./LiquidityManager');
const providerHealthEngine = require('./ProviderHealthEngine');
const treasuryBusinessRulesEngine = require('./TreasuryBusinessRulesEngine');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

class TreasuryRouter {
  /**
   * Score candidate providers and select optimal routing decision.
   *
   * @param {object} params
   * @param {string} params.currency - e.g. 'NGN', 'USD', 'USDT'
   * @param {number} params.amount - Transaction amount
   * @param {string} [params.operation='withdraw'] - 'withdraw' | 'deposit' | 'swap' | 'fx'
   * @returns {Promise<object>} Selected optimal provider and complete score breakdown
   */
  async selectOptimalProvider({ currency, amount, operation = 'withdraw' }) {
    const cur = String(currency).toUpperCase();
    const decAmt = new Decimal(amount);

    // 1. Get adapters supporting currency & operation
    const candidates = adapterRegistry.getSupportingAdapters(cur, operation);

    if (candidates.length === 0) {
      throw new Error(`[TreasuryRouter] No registered provider adapter supports currency '${cur}' for operation '${operation}'.`);
    }

    // 2. Check dynamic business rules override (e.g. large payout routing rule)
    const ruleResult = treasuryBusinessRulesEngine.evaluateRoutingRule(cur, decAmt.toNumber());

    // 3. Compute score for each candidate provider
    const scoredProviders = [];

    for (const adapter of candidates) {
      const provId = adapter.getProviderId();
      const caps = adapter.getCapabilities();

      // Fetch health & liquidity metrics
      const healthData = await providerHealthEngine.getAllStatuses();
      const provHealth = healthData.find(h => String(h.provider).toUpperCase() === provId);

      const circuitState = provHealth?.circuit_breaker || 'CLOSED';
      if (circuitState === 'OPEN') {
        logger.warn(`[TreasuryRouter] Provider ${provId} skipped due to OPEN circuit breaker.`);
        continue; // Exclude OPEN circuit providers from routing
      }

      const liqState = await liquidityManager.getLiquidity(provId, cur);
      const hasEnoughLiquidity = await liquidityManager.verifyLiquidity(provId, cur, decAmt.toNumber());

      // ── Scoring Dimensions (0 - 100) ──────────────────────────────────
      // 1. Health Score (25%)
      const healthScore = circuitState === 'CLOSED' ? 100 : 50;

      // 2. Liquidity Score (25%)
      let liquidityScore = 0;
      if (hasEnoughLiquidity) {
        const marginRatio = new Decimal(liqState.available).div(decAmt.gt(0) ? decAmt : 1);
        liquidityScore = Math.min(100, Math.round(marginRatio.mul(20).toNumber()));
      }

      // 3. Fee Score (20%) - Lower fee -> Higher score
      const estimatedFee = caps.baseFee + (decAmt.toNumber() * caps.feePercentage);
      const feeScore = Math.max(0, 100 - (estimatedFee / (decAmt.toNumber() || 1)) * 1000);

      // 4. Speed Score (15%) - Lower latency -> Higher score
      const speedScore = Math.max(0, 100 - (caps.avgSettlementTimeSeconds / 60) * 10);

      // 5. Compliance & Business Rule Score (15%)
      let complianceScore = 80;
      if (ruleResult.ruleApplied && ruleResult.preferredProvider === provId) {
        complianceScore = 100;
      }

      // Composite Weighted Score
      const compositeScore = (
        (healthScore * 0.25) +
        (liquidityScore * 0.25) +
        (feeScore * 0.20) +
        (speedScore * 0.15) +
        (complianceScore * 0.15)
      );

      scoredProviders.push({
        providerId: provId,
        adapter,
        compositeScore: parseFloat(compositeScore.toFixed(2)),
        hasLiquidity: hasEnoughLiquidity,
        scores: {
          health: healthScore,
          liquidity: liquidityScore,
          fee: feeScore,
          speed: speedScore,
          compliance: complianceScore,
        },
      });
    }

    // Sort by composite score descending
    scoredProviders.sort((a, b) => b.compositeScore - a.compositeScore);

    if (scoredProviders.length === 0 || !scoredProviders[0].hasLiquidity) {
      logger.warn(`[TreasuryRouter] No online provider has sufficient liquidity for ${decAmt.toString()} ${cur}. Initiating retry queue / emergency mode.`);
      return {
        selectedProviderId: null,
        fallbackQueueRequired: true,
        scoredProviders,
        recommendation: 'TRIGGER_EMERGENCY_RETRY_QUEUE',
      };
    }

    const optimal = scoredProviders[0];
    const failoverList = scoredProviders.slice(1).map(p => p.providerId);

    logger.info(`[TreasuryRouter] Selected optimal provider ${optimal.providerId} (Score: ${optimal.compositeScore}) for ${decAmt.toString()} ${cur}. Failovers: [${failoverList.join(', ')}]`);

    return {
      selectedProviderId: optimal.providerId,
      adapter: optimal.adapter,
      compositeScore: optimal.compositeScore,
      failoverList,
      scoredProviders,
      fallbackQueueRequired: false,
    };
  }
}

module.exports = new TreasuryRouter();
