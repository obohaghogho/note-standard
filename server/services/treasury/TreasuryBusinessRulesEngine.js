'use strict';

/**
 * TreasuryBusinessRulesEngine.js
 * ===============================
 * Dynamic Business Rules Engine for NoteStandard Treasury Operations.
 *
 * Replaces hardcoded `if (currency === 'NGN')` branches with declarative,
 * configurable rules evaluated dynamically at runtime.
 *
 * Rule Types:
 *   - MINIMUM_TREASURY_RESERVE
 *   - WEEKEND_RESERVE_MULTIPLIER
 *   - HIGH_VALUE_PAYOUT_ROUTING
 *   - MAX_DAILY_PROVIDER_LIMIT
 *
 * Rules can be added, updated, or toggled without requiring code deployments.
 *
 * @module services/treasury/TreasuryBusinessRulesEngine
 */

const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

class TreasuryBusinessRulesEngine {
  constructor() {
    this.rules = new Map([
      ['MIN_RESERVE_NGN', { type: 'MIN_RESERVE', currency: 'NGN', value: 2000000.0, enabled: true }],
      ['MIN_RESERVE_USD', { type: 'MIN_RESERVE', currency: 'USD', value: 10000.0, enabled: true }],
      ['MIN_RESERVE_EUR', { type: 'MIN_RESERVE', currency: 'EUR', value: 10000.0, enabled: true }],
      ['MIN_RESERVE_GBP', { type: 'MIN_RESERVE', currency: 'GBP', value: 10000.0, enabled: true }],
      ['MIN_RESERVE_BTC', { type: 'MIN_RESERVE', currency: 'BTC', value: 0.25, enabled: true }],
      ['WEEKEND_BUFFER',  { type: 'WEEKEND_MULTIPLIER', multiplier: 1.3, enabled: true }],
      ['LARGE_PAYOUT_THRESHOLD_NGN', { type: 'LARGE_PAYOUT_ROUTING', currency: 'NGN', threshold: 5000000.0, preferredProvider: 'FINCRA', fallbackProvider: 'ANCHOR', enabled: true }],
    ]);
  }

  /**
   * Evaluate minimum required reserve for currency, taking into account rules & weekend multipliers.
   */
  getRequiredReserve(currency) {
    const cur = String(currency).toUpperCase();
    const ruleKey = `MIN_RESERVE_${cur}`;
    const rule = this.rules.get(ruleKey);

    let baseValue = rule && rule.enabled ? rule.value : 0;
    const decBase = new Decimal(baseValue);

    // Apply weekend buffer rule (+30%) if today is Saturday or Sunday
    const weekendRule = this.rules.get('WEEKEND_BUFFER');
    const isWeekend = [0, 6].includes(new Date().getDay());

    if (isWeekend && weekendRule && weekendRule.enabled) {
      return decBase.mul(weekendRule.multiplier).toNumber();
    }

    return decBase.toNumber();
  }

  /**
   * Evaluate preferred provider routing rule based on payout size.
   */
  evaluateRoutingRule(currency, amount) {
    const cur = String(currency).toUpperCase();
    const decAmt = new Decimal(amount);
    const rule = this.rules.get(`LARGE_PAYOUT_THRESHOLD_${cur}`);

    if (rule && rule.enabled && decAmt.gte(new Decimal(rule.threshold))) {
      logger.info(`[TreasuryBusinessRulesEngine] Large payout rule triggered for ${decAmt.toString()} ${cur}: Preferred = ${rule.preferredProvider}`);
      return {
        ruleApplied: true,
        preferredProvider: rule.preferredProvider,
        fallbackProvider: rule.fallbackProvider,
        reason: `Payout ${decAmt.toString()} ${cur} >= Large Payout Threshold ${rule.threshold}`,
      };
    }

    return { ruleApplied: false };
  }

  /**
   * Add or update a business rule dynamically at runtime.
   */
  setRule(ruleId, ruleDefinition) {
    this.rules.set(ruleId, { ...ruleDefinition, updatedAt: new Date().toISOString() });
    logger.info(`[TreasuryBusinessRulesEngine] Dynamic rule updated: ${ruleId}`);
    return true;
  }

  /**
   * Get all active business rules.
   */
  getRules() {
    const activeRules = {};
    for (const [id, r] of this.rules.entries()) {
      activeRules[id] = r;
    }
    return activeRules;
  }
}

module.exports = new TreasuryBusinessRulesEngine();
