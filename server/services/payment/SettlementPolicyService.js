'use strict';

/**
 * SettlementPolicyService.js
 * ===========================
 * Evaluates settlement windows, cutoff times, instant vs. delayed settlement rules,
 * and reversibility rules across providers and payment rails.
 */
class SettlementPolicyService {
  constructor() {
    this.railPolicies = {
      SEPA: {
        settlementType: 'INSTANT',
        settlementDelayMs: 0,
        reversible: true,
        riskHoldingPeriodHours: 0
      },
      FASTER_PAYMENTS: {
        settlementType: 'INSTANT',
        settlementDelayMs: 0,
        reversible: false,
        riskHoldingPeriodHours: 0
      },
      ACH: {
        settlementType: 'DELAYED',
        settlementDelayMs: 24 * 3600 * 1000, // 24 hours
        reversible: true,
        riskHoldingPeriodHours: 24
      },
      SWIFT: {
        settlementType: 'DELAYED',
        settlementDelayMs: 48 * 3600 * 1000, // 48 hours
        reversible: false,
        riskHoldingPeriodHours: 0
      },
      LOCAL: {
        settlementType: 'INSTANT',
        settlementDelayMs: 0,
        reversible: false,
        riskHoldingPeriodHours: 0
      }
    };
  }

  /**
   * Evaluate settlement policy for a deposit
   */
  evaluateSettlement({ provider, rail = 'LOCAL', amount = 0, currency = 'USD' }) {
    const policy = this.railPolicies[rail.toUpperCase()] || this.railPolicies.LOCAL;
    const now = new Date();
    const settlementDate = new Date(now.getTime() + policy.settlementDelayMs);

    const requiresHolding = amount > 10000 || policy.settlementType === 'DELAYED';

    return {
      provider,
      rail: rail.toUpperCase(),
      currency: currency.toUpperCase(),
      amount: parseFloat(amount),
      settlementType: policy.settlementType,
      settlementStatus: requiresHolding ? 'PENDING_SETTLEMENT' : 'SETTLED',
      settlementDate,
      reversible: policy.reversible,
      requiresHolding,
      riskHoldingPeriodHours: requiresHolding ? policy.riskHoldingPeriodHours : 0
    };
  }
}

module.exports = SettlementPolicyService;
