'use strict';
/**
 * FincraBalanceFetcher.js
 * =======================
 * Fetches live merchant wallet balances from Fincra.
 * Maps Fincra's API response to the standard treasury balance shape.
 *
 * Standard output shape:
 * {
 *   provider, currency, available_balance, pending_balance,
 *   reserved_balance, locked_balance, ledger_balance, raw
 * }
 *
 * @module services/treasury/fetchers/FincraBalanceFetcher
 */

const logger = require('../../../utils/logger');

// Reuse the existing Fincra wallet inquiry service — no new HTTP client needed
const { getFincraWallets } = require('../../fincra/wallet');

const PROVIDER = 'fincra';

// Map Fincra currency labels to canonical uppercase codes
const CURRENCY_MAP = {
  ngn: 'NGN', usd: 'USD', eur: 'EUR', gbp: 'GBP',
  NGN: 'NGN', USD: 'USD', EUR: 'EUR', GBP: 'GBP',
};

class FincraBalanceFetcher {
  /**
   * Fetch all Fincra merchant wallet balances.
   * @returns {Promise<Array>}  Array of standard balance objects
   */
  async fetchAll() {
    const wallets = await getFincraWallets();

    if (!Array.isArray(wallets)) {
      logger.warn('[FincraBalanceFetcher] Unexpected response shape from getFincraWallets');
      return [];
    }

    const results = [];

    for (const wallet of wallets) {
      const rawCurrency = wallet.currency || wallet.currencyCode || '';
      const currency    = CURRENCY_MAP[rawCurrency] || rawCurrency.toUpperCase();
      if (!currency) continue;

      // Fincra wallet fields vary slightly between sandbox and live
      const available = parseFloat(
        wallet.balance       ??
        wallet.availableBalance ??
        wallet.ledger_balance ??
        0
      );
      const pending   = parseFloat(wallet.pendingBalance  ?? wallet.pending_balance   ?? 0);
      const reserved  = parseFloat(wallet.reservedBalance ?? wallet.reserved_balance  ?? 0);
      const locked    = parseFloat(wallet.lockedBalance   ?? wallet.locked_balance    ?? 0);
      const ledger    = available + pending;

      results.push({
        provider:          PROVIDER,
        currency,
        available_balance: available,
        pending_balance:   pending,
        reserved_balance:  reserved,
        locked_balance:    locked,
        ledger_balance:    ledger,
        raw:               wallet,
      });
    }

    logger.info(`[FincraBalanceFetcher] Fetched ${results.length} wallet(s) from Fincra`);
    return results;
  }
}

module.exports = new FincraBalanceFetcher();
