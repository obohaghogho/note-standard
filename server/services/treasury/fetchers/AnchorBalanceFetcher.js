'use strict';
/**
 * AnchorBalanceFetcher.js
 * =======================
 * Fetches Anchor NGN and USD balances for TreasuryService.
 * Delegates to the existing AnchorProvider.balanceInquiry().
 *
 * @module services/treasury/fetchers/AnchorBalanceFetcher
 */

const logger = require('../../../utils/logger');

const AnchorBalanceFetcher = {
  providerKey: 'anchor',
  currencies:  ['NGN', 'USD'],

  async fetchAll() {
    const AnchorProvider = require('../../payment/providers/AnchorProvider');
    const instance = new AnchorProvider();

    if (!instance.isEnabled) {
      logger.info('[AnchorBalanceFetcher] Anchor is disabled — skipping balance fetch');
      return [];
    }

    const results = [];

    for (const currency of this.currencies) {
      try {
        const { balance } = await instance.balanceInquiry(currency);
        results.push({
          provider:          'anchor',
          currency,
          available_balance: parseFloat(balance || 0),
          pending_balance:   0,
          reserved_balance:  0,
          raw:               { balance, currency },
          fetched_at:        new Date().toISOString(),
        });
        logger.info(`[AnchorBalanceFetcher] ${currency}: ${balance}`);
      } catch (err) {
        logger.warn(`[AnchorBalanceFetcher] Failed for ${currency}: ${err.message}`);
        results.push({
          provider:          'anchor',
          currency,
          available_balance: null,
          pending_balance:   null,
          reserved_balance:  null,
          error:             err.message,
          fetched_at:        new Date().toISOString(),
        });
      }
    }

    return results;
  },
};

module.exports = AnchorBalanceFetcher;
