'use strict';
/**
 * GreyBalanceFetcher.js
 * =====================
 * Fetches treasury balances from Grey (formerly Grey Finance).
 * Grey is used for USD, EUR, and GBP cross-border settlement.
 *
 * NOTE: Grey's balance API endpoint may require a dedicated
 * business/treasury account API key. If GREY_API_KEY is not
 * configured, this fetcher returns an empty result set
 * (non-blocking — does not fail the sync cycle).
 *
 * @module services/treasury/fetchers/GreyBalanceFetcher
 */

const axios  = require('axios');
const logger = require('../../../utils/logger');

const PROVIDER  = 'grey';
const BASE_URL  = process.env.GREY_API_URL || 'https://api.grey.co';
const TIMEOUT   = 12000;

class GreyBalanceFetcher {
  async fetchAll() {
    const apiKey = process.env.GREY_API_KEY;
    if (!apiKey) {
      logger.info('[GreyBalanceFetcher] GREY_API_KEY not configured. Returning empty. (Non-critical)');
      return [];
    }

    try {
      const { data } = await axios.get(`${BASE_URL}/v1/wallets`, {
        timeout: TIMEOUT,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Grey wallet response shape (adapt to their actual API when confirmed):
      // { data: [ { currency, available, pending, locked } ] }
      const wallets = data?.data || data?.wallets || [];
      const results = [];

      for (const wallet of wallets) {
        const currency = (wallet.currency || '').toUpperCase();
        if (!currency) continue;

        results.push({
          provider:          PROVIDER,
          currency,
          available_balance: parseFloat(wallet.available || wallet.balance || 0),
          pending_balance:   parseFloat(wallet.pending   || 0),
          reserved_balance:  parseFloat(wallet.reserved  || 0),
          locked_balance:    parseFloat(wallet.locked    || 0),
          ledger_balance:    parseFloat(wallet.ledger    || wallet.available || 0),
          raw:               wallet,
        });
      }

      logger.info(`[GreyBalanceFetcher] Fetched ${results.length} wallet(s) from Grey`);
      return results;
    } catch (err) {
      // 404 / 401 means Grey is not yet activated for this account
      if (err.response?.status === 404 || err.response?.status === 401) {
        logger.warn(`[GreyBalanceFetcher] Grey API returned ${err.response.status}. Skipping grey sync.`);
        return [];
      }
      logger.error(`[GreyBalanceFetcher] Fetch failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new GreyBalanceFetcher();
