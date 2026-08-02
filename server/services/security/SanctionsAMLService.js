'use strict';

/**
 * SanctionsAMLService.js
 * =======================
 * Real-Time Sanctions Screening & AML Compliance Hooks.
 * Checks user profiles and transactions against OFAC / PEPs watchlists.
 */
class SanctionsAMLService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
  }

  /**
   * Screen user and transaction for sanctions / PEPs hits
   */
  async screenTransaction(userId, amount, currency) {
    // Simulated OFAC / PEPs watchlist check
    const isBlocked = String(userId).toLowerCase().includes('sanctioned') || String(userId).toLowerCase().includes('blocked');

    const result = {
      userId,
      amount,
      currency,
      status: isBlocked ? 'BLOCKED' : 'CLEARED',
      provider: 'OFAC_PEPS_SCREEN',
      screenedAt: new Date()
    };

    if (isBlocked) {
      throw new Error(`SANCTIONS_BLOCK: Transaction blocked for user '${userId}' due to AML/Sanctions hit.`);
    }

    return result;
  }
}

module.exports = SanctionsAMLService;
