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
// Correct base URL per Grey Finance Business API spec
const greyEnv   = (process.env.GREY_ENV || 'production').toLowerCase();
const defaultBase = greyEnv === 'sandbox'
  ? 'https://businessapi-sandbox.grey.co'
  : 'https://businessapi.grey.co';
const BASE_URL  = (process.env.GREY_BASE_URL || process.env.GREY_API_URL || defaultBase).trim();
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

      // Grey Business API balance shape:
      // { status, message, data: { balances: [{ currency, available_balance, pending_balance }] } }
      const wallets =
        data?.data?.balances ||
        data?.data ||
        data?.balances ||
        [];
      const results = [];

      for (const wallet of wallets) {
        const currency = (wallet.currency || '').toUpperCase();
        if (!currency) continue;

        results.push({
          provider:          PROVIDER,
          currency,
          available_balance: parseFloat(wallet.available_balance ?? wallet.available ?? wallet.balance ?? 0),
          pending_balance:   parseFloat(wallet.pending_balance  ?? wallet.pending   ?? 0),
          reserved_balance:  parseFloat(wallet.reserved  || 0),
          locked_balance:    parseFloat(wallet.locked     || 0),
          ledger_balance:    parseFloat(wallet.available_balance ?? wallet.available ?? wallet.balance ?? 0),
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
