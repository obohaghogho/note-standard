'use strict';
/**
 * PaystackBalanceFetcher.js
 * =========================
 * Fetches Paystack balance from the Paystack Balances API.
 * Only NGN is natively supported by Paystack.
 *
 * @module services/treasury/fetchers/PaystackBalanceFetcher
 */

const axios  = require('axios');
const logger = require('../../../utils/logger');

const PROVIDER  = 'paystack';
const BASE_URL  = 'https://api.paystack.co';
const TIMEOUT   = 10000;

class PaystackBalanceFetcher {
  async fetchAll() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      logger.warn('[PaystackBalanceFetcher] PAYSTACK_SECRET_KEY not set. Skipping.');
      return [];
    }

    try {
      const { data } = await axios.get(`${BASE_URL}/balance`, {
        timeout: TIMEOUT,
        headers: { Authorization: `Bearer ${secretKey}` },
      });

      // Paystack returns: { status, data: [ { currency, balance } ] }
      const balances = data?.data || [];
      const results  = [];

      for (const item of balances) {
        const currency  = (item.currency || 'NGN').toUpperCase();
        // Paystack returns balance in kobo (NGN minor unit) — convert to naira
        const divisor   = currency === 'NGN' ? 100 : 1;
        const available = parseFloat(item.balance || 0) / divisor;

        results.push({
          provider:          PROVIDER,
          currency,
          available_balance: available,
          pending_balance:   0,
          reserved_balance:  0,
          locked_balance:    0,
          ledger_balance:    available,
          raw:               item,
        });
      }

      logger.info(`[PaystackBalanceFetcher] Fetched ${results.length} balance(s) from Paystack`);
      return results;
    } catch (err) {
      logger.error(`[PaystackBalanceFetcher] Fetch failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new PaystackBalanceFetcher();
