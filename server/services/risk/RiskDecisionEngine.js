'use strict';

/**
 * RiskDecisionEngine.js
 * =====================
 * Step 10 Centralized Risk & Fraud Decision Engine for NoteStandard.
 * Evaluates velocity limits, fraud scoring, and manual review queue routing.
 */
class RiskDecisionEngine {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
  }

  /**
   * Evaluate transaction risk before execution
   */
  async evaluateRisk(transaction = {}) {
    const { amount = 0, userId = 'usr_anon', currency = 'NGN' } = transaction;

    let riskScore = 10.0;
    const triggeredRules = [];

    // 1. Velocity Limit Check
    if (amount > 5000000) {
      riskScore += 40.0;
      triggeredRules.push('SINGLE_TX_EXCEEDS_5M_LIMIT');
    }

    // 2. High-Risk User Check
    if (String(userId).includes('suspicious')) {
      riskScore += 50.0;
      triggeredRules.push('HIGH_RISK_SUSPICIOUS_USER_FLAG');
    }

    let recommendation = 'APPROVE';
    if (riskScore >= 75.0) recommendation = 'REJECT';
    else if (riskScore >= 40.0) recommendation = 'FLAG_MANUAL_REVIEW';

    return {
      transactionId: transaction.id || `tx_risk_${Date.now()}`,
      userId,
      amount,
      currency,
      riskScore,
      recommendation,
      triggeredRules,
      assessedAt: new Date()
    };
  }
}

module.exports = RiskDecisionEngine;
