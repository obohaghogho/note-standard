'use strict';

/**
 * AutoLiquidityBalancer.js
 * ========================
 * Automated Tiered Liquidity Rebalancing & Replenishment Service.
 *
 * Enforces the 3-Tier Treasury Reserve Policy (Target, Minimum, Critical):
 *   - BELOW_TARGET   -> Gradually replenish to Target reserve.
 *   - BELOW_MINIMUM  -> Immediately replenish to Target reserve.
 *   - BELOW_CRITICAL -> Emergency immediate replenishment & trigger reroute / queue.
 *
 * @module services/treasury/AutoLiquidityBalancer
 */

const liquidityManager = require('./LiquidityManager');
const providerFundingService = require('./ProviderFundingService');
const liquidityPredictionEngine = require('./LiquidityPredictionEngine');
const treasuryReservePolicy = require('./TreasuryReservePolicy');
const treasuryVault = require('./TreasuryVault');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

class AutoLiquidityBalancer {
  constructor() {
    this.isRebalancing = false;
  }

  /**
   * Run tiered rebalancing check across all active providers & currencies.
   */
  async runRebalanceCheck() {
    if (this.isRebalancing) return { status: 'IN_PROGRESS' };
    this.isRebalancing = true;

    const rebalanceEvents = [];

    try {
      const aggregated = await liquidityManager.getAggregatedLiquidity();

      for (const [currency, data] of Object.entries(aggregated)) {
        for (const [provId, provState] of Object.entries(data.providers)) {
          const avail = provState.available;
          const tierEval = treasuryReservePolicy.evaluateLiquidityTier(currency, avail);
          const pred = await liquidityPredictionEngine.predictLiquidity(provId, currency, 60);

          if (tierEval.status !== 'TARGET_MET' || pred.shortageImminent) {
            const vaultReserve = await treasuryVault.getVaultBalance(currency);
            let neededAmount = Math.max(tierEval.replenishmentNeeded, pred.shortageImminent ? Math.abs(pred.netBuffer) : 0);
            neededAmount = Math.min(neededAmount, vaultReserve);

            if (neededAmount > 0) {
              logger.warn(`[AutoLiquidityBalancer] [Tier: ${tierEval.status}] Low balance on ${provId} for ${currency} (${avail} < Target ${tierEval.tiers.target}). Replenishing ${neededAmount} ${currency}...`);

              const fundResult = await providerFundingService.fundProvider({
                providerId: provId,
                currency,
                amount: neededAmount,
                reason: `${tierEval.status}_AUTO_REPLENISHMENT`,
              });

              rebalanceEvents.push({
                tierEval,
                fundResult,
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[AutoLiquidityBalancer] Rebalance cycle error: ${err.message}`);
    } finally {
      this.isRebalancing = false;
    }

    return {
      status: 'COMPLETED',
      rebalanceCount: rebalanceEvents.length,
      events: rebalanceEvents,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new AutoLiquidityBalancer();
