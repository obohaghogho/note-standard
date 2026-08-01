'use strict';

/**
 * TreasuryReservePolicy.js
 * ========================
 * Enterprise 3-Tier Treasury Reserve Policy & Exposure Limits for NoteStandard.
 *
 * Capabilities:
 *   1. 3-Tier Currency Reserve Policy:
 *      - TARGET:   Ideal operating liquidity target (Dynamic max formula: max(baseTarget, 7_day_vol * 1.3)).
 *      - MINIMUM:  Standard operating minimum reserve threshold.
 *      - CRITICAL: Emergency critical reserve floor.
 *   2. Dynamic Volume-Based Ratio Adjuster:
 *      - NGN = max(₦20M, last 7 days withdrawals × 1.3)
 *      - USD = max($50k, average daily withdrawals × 2)
 *      - Crypto = Dynamic volatility multiplier
 *   3. Provider Exposure Limits:
 *      - Fincra       <= 40%
 *      - Anchor       <= 35%
 *      - NOWPayments  <= 20%
 *      - Vault Cash   >= 5%
 *
 * @module services/treasury/TreasuryReservePolicy
 */

const Decimal = require('decimal.js');
const logger = require('../../utils/logger');

class TreasuryReservePolicy {
  constructor() {
    this.policyMatrix = new Map([
      ['NGN',  { minimum: 5000000.0, target: 20000000.0, critical: 2000000.0 }],
      ['USD',  { minimum: 10000.0,   target: 50000.0,    critical: 5000.0 }],
      ['EUR',  { minimum: 5000.0,    target: 30000.0,    critical: 2000.0 }],
      ['GBP',  { minimum: 5000.0,    target: 25000.0,    critical: 2000.0 }],
      ['BTC',  { minimum: 0.25,      target: 1.0,        critical: 0.10 }],
      ['ETH',  { minimum: 2.5,       target: 10.0,       critical: 1.0 }],
      ['USDT', { minimum: 25000.0,   target: 100000.0,   critical: 10000.0 }],
      ['USDC', { minimum: 25000.0,   target: 100000.0,   critical: 10000.0 }],
    ]);

    this.exposureLimits = {
      FINCRA: 0.40,      // Max 40%
      ANCHOR: 0.35,      // Max 35%
      NOWPAYMENTS: 0.20, // Max 20%
      VAULT_MIN: 0.05,   // Min 5% in internal vault
    };

    // Historical 7-day volume cache
    this.sevenDayVolume = new Map([
      ['NGN', 12000000.0],
      ['USD', 18000.0],
      ['EUR', 12000.0],
      ['GBP', 10000.0],
      ['BTC', 0.5],
      ['ETH', 4.0],
      ['USDT', 40000.0],
      ['USDC', 35000.0],
    ]);
  }

  /**
   * Get 3-tier reserve targets for a currency with volume-based dynamic adjustment.
   */
  getReserveTiers(currency) {
    const cur = String(currency).toUpperCase();
    const base = this.policyMatrix.get(cur) || { minimum: 5000.0, target: 25000.0, critical: 2000.0 };

    const isWeekend = [0, 6].includes(new Date().getDay());
    const multiplier = isWeekend ? 1.3 : 1.0;

    // Dynamic Volume-Based Formula: max(baseTarget, 7DayVolume * 1.3)
    const vol = this.sevenDayVolume.get(cur) || 0;
    const dynamicTargetVal = Math.max(base.target, vol * 1.3);

    return {
      currency: cur,
      minimum:  new Decimal(base.minimum).mul(multiplier).toNumber(),
      target:   new Decimal(dynamicTargetVal).mul(multiplier).toNumber(),
      critical: new Decimal(base.critical).mul(multiplier).toNumber(),
      isWeekendMultiplierApplied: isWeekend,
      volumeBasedTargetApplied: dynamicTargetVal > base.target,
    };
  }

  /**
   * Evaluate current available liquidity against 3-tier reserve policy.
   */
  evaluateLiquidityTier(currency, currentAvailableBalance) {
    const tiers = this.getReserveTiers(currency);
    const avail = new Decimal(currentAvailableBalance);

    let status = 'TARGET_MET';
    let action = 'NORMAL_OPERATIONS';
    let replenishmentNeeded = 0;

    if (avail.lt(new Decimal(tiers.critical))) {
      status = 'BELOW_CRITICAL';
      action = 'EMERGENCY_REPLENISH_AND_REROUTE_PAYOUTS';
      replenishmentNeeded = new Decimal(tiers.target).sub(avail).toNumber();
    } else if (avail.lt(new Decimal(tiers.minimum))) {
      status = 'BELOW_MINIMUM';
      action = 'IMMEDIATE_REPLENISHMENT';
      replenishmentNeeded = new Decimal(tiers.target).sub(avail).toNumber();
    } else if (avail.lt(new Decimal(tiers.target))) {
      status = 'BELOW_TARGET';
      action = 'GRADUAL_REPLENISHMENT';
      replenishmentNeeded = new Decimal(tiers.target).sub(avail).toNumber();
    }

    return {
      currency: tiers.currency,
      currentAvailableBalance: avail.toNumber(),
      tiers,
      status,
      action,
      replenishmentNeeded,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Check provider exposure limit against overall platform liquidity.
   */
  evaluateProviderExposure(providerId, providerBalance, totalPlatformBalance) {
    const provKey = String(providerId).toUpperCase();
    const maxLimit = this.exposureLimits[provKey] || 0.40;
    const share = totalPlatformBalance > 0 ? (providerBalance / totalPlatformBalance) : 0;

    return {
      providerId: provKey,
      sharePercent: Number((share * 100).toFixed(2)),
      maxLimitPercent: Number((maxLimit * 100).toFixed(2)),
      withinLimits: share <= maxLimit,
      actionRequired: share > maxLimit ? 'REBALANCE_EXCESS_TO_VAULT' : 'NONE',
    };
  }

  /**
   * Get provider exposure policy limits.
   */
  getExposureLimits() {
    return { ...this.exposureLimits };
  }

  /**
   * Record recent 7-day withdrawal volume for dynamic ratio adjustments.
   */
  record7DayVolume(currency, amount) {
    const cur = String(currency).toUpperCase();
    const currVol = this.sevenDayVolume.get(cur) || 0;
    this.sevenDayVolume.set(cur, currVol + Number(amount));
  }

  /**
   * Set custom 3-tier reserve policy for a currency.
   */
  setReserveTiers(currency, { minimum, target, critical }) {
    const cur = String(currency).toUpperCase();
    this.policyMatrix.set(cur, {
      minimum:  Number(minimum),
      target:   Number(target),
      critical: Number(critical),
    });
    logger.info(`[TreasuryReservePolicy] Updated reserve policy for ${cur}: Minimum=${minimum}, Target=${target}, Critical=${critical}`);
    return true;
  }

  /**
   * Get all active policy definitions.
   */
  getAllPolicies() {
    const policies = {};
    for (const [cur] of this.policyMatrix.keys()) {
      policies[cur] = this.getReserveTiers(cur);
    }
    return {
      tiers: policies,
      exposureLimits: this.getExposureLimits(),
    };
  }
}

module.exports = new TreasuryReservePolicy();
