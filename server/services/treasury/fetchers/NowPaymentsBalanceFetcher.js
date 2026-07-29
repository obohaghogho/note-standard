'use strict';
/**
 * NowPaymentsBalanceFetcher.js
 * ============================
 * Fetches custody balances from NOWPayments for all supported
 * crypto assets (BTC, ETH, USDT, USDC, etc.)
 *
 * @module services/treasury/fetchers/NowPaymentsBalanceFetcher
 */

const axios  = require('axios');
const logger = require('../../../utils/logger');

const PROVIDER  = 'nowpayments';
const BASE_URL  = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';
const TIMEOUT   = 15000;

// Currencies we track via NOWPayments
const TRACKED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'TRX'];

class NowPaymentsBalanceFetcher {
  async fetchAll() {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      logger.warn('[NowPaymentsBalanceFetcher] NOWPAYMENTS_API_KEY not set. Skipping.');
      return [];
    }

    try {
      const { data } = await axios.get(`${BASE_URL}/balance`, {
        timeout: TIMEOUT,
        headers: { 'x-api-key': apiKey },
      });

      // NOWPayments returns:
      // { currencies: [ { currency: 'btc', amount: '0.05', pendingAmount: '0' } ] }
      const currencies = data?.currencies || [];
      const results    = [];

      for (const item of currencies) {
        const rawCurrency = (item.currency || '').toUpperCase();
        if (!TRACKED_CURRENCIES.includes(rawCurrency)) continue;

        const available = parseFloat(item.amount         || item.balance         || 0);
        const pending   = parseFloat(item.pendingAmount  || item.pending_amount  || 0);

        results.push({
          provider:          PROVIDER,
          currency:          rawCurrency,
          available_balance: available,
          pending_balance:   pending,
          reserved_balance:  0,
          locked_balance:    0,
          ledger_balance:    available + pending,
          raw:               item,
        });
      }

      logger.info(`[NowPaymentsBalanceFetcher] Fetched ${results.length} crypto balance(s) from NOWPayments`);
      return results;
    } catch (err) {
      logger.error(`[NowPaymentsBalanceFetcher] Fetch failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new NowPaymentsBalanceFetcher();
