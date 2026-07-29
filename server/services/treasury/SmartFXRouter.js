'use strict';
/**
 * SmartFXRouter.js
 * ================
 * Compares FX rates across providers and returns ranked options.
 * SKELETON — disabled by default. Activated via routing_policies.smart_fx_enabled=true.
 *
 * When enabled, compares:
 *   - Internal ledger rate (current behaviour)
 *   - Fincra FX
 *   - Anchor FX
 *   - Grey FX
 *   - Future liquidity providers
 *
 * The FinancialOrchestrator calls getOptimalFXSource() before executing swaps.
 * If smart_fx_enabled=false (default), it returns { source: 'internal', rate: null }
 * and the existing internal ledger conversion is used unchanged.
 *
 * @module services/treasury/SmartFXRouter
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const SmartFXRouter = {
  /**
   * Check if smart FX routing is enabled for a given currency pair.
   */
  async isEnabled(fromCurrency, toCurrency) {
    const { data } = await supabase
      .from('routing_policies')
      .select('smart_fx_enabled')
      .eq('currency', String(fromCurrency).toUpperCase())
      .eq('transaction_type', 'SWAP')
      .eq('is_active', true)
      .maybeSingle();
    return data?.smart_fx_enabled === true;
  },

  /**
   * Get the optimal FX source for a currency swap.
   * Returns internal conversion by default if smart FX is disabled.
   *
   * @param {string} fromCurrency
   * @param {string} toCurrency
   * @param {number} amount
   * @returns {Promise<{ source: string, rate: number|null, fee: number, estimatedOutput: number|null, ranked: Array }>}
   */
  async getOptimalFXSource(fromCurrency, toCurrency, amount) {
    const smartEnabled = await this.isEnabled(fromCurrency, toCurrency);

    if (!smartEnabled) {
      return {
        source:          'internal',
        rate:            null,
        fee:             0,
        estimatedOutput: null,
        ranked:          [],
        smartFxActive:   false,
      };
    }

    // ── [Phase 17] Inventory-first: check internal reserve before external quotes ──
    const internalResult = await this._checkInternalInventory(toCurrency, amount);
    if (internalResult.sufficient) {
      logger.info(`[SmartFXRouter] Internal inventory sufficient for ${toCurrency} ${amount} \u2014 skipping external quotes`);
      return {
        source:          'internal',
        rate:            null,
        fee:             0,
        estimatedOutput: amount,
        ranked:          [internalResult],
        smartFxActive:   true,
        inventoryUsed:   true,
      };
    }

    // ── Smart FX: query available providers for rates ──────────────────────────
    const quotes = await this._collectQuotes(fromCurrency, toCurrency, amount);

    if (quotes.length === 0) {
      logger.warn(`[SmartFXRouter] No FX quotes available for ${fromCurrency}→${toCurrency}. Using internal.`);
      return { source: 'internal', rate: null, fee: 0, estimatedOutput: null, ranked: [], smartFxActive: true };
    }

    // Rank by estimated output (highest = best)
    quotes.sort((a, b) => (b.estimatedOutput || 0) - (a.estimatedOutput || 0));
    const best = quotes[0];

    logger.info(`[SmartFXRouter] Best FX: ${best.source} rate=${best.rate} (${fromCurrency}→${toCurrency})`);

    return {
      source:          best.source,
      rate:            best.rate,
      fee:             best.fee,
      estimatedOutput: best.estimatedOutput,
      ranked:          quotes,
      smartFxActive:   true,
      inventoryUsed:   false,
    };
  },

  /**
   * [Phase 17] Check if the internal treasury has sufficient reserve for toCurrency.
   * Uses MultiProviderReserveEngine to read aggregated available balances.
   */
  async _checkInternalInventory(toCurrency, amount) {
    try {
      const MultiProviderReserveEngine = require('./MultiProviderReserveEngine');
      const ratio = await MultiProviderReserveEngine.computeForCurrency(toCurrency);
      const internalAvailable = ratio.total_assets || 0;
      // Use a safety buffer: only use internal if we have 110% of the requested amount
      const sufficient = internalAvailable >= (amount * 1.10);
      return {
        source:          'internal',
        available:       internalAvailable,
        requested:       amount,
        sufficient,
        bufferPct:       110,
      };
    } catch (e) {
      logger.warn(`[SmartFXRouter] Internal inventory check failed: ${e.message}`);
      return { source: 'internal', available: 0, requested: amount, sufficient: false };
    }
  },

  /**
   * Collect FX quotes from available providers.
   * Each quote is a best-effort — failures are silently excluded.
   */
  async _collectQuotes(fromCurrency, toCurrency, amount) {
    const quotes = [];
    const from   = String(fromCurrency).toUpperCase();
    const to     = String(toCurrency).toUpperCase();

    // ── Fincra FX ─────────────────────────────────────────────────────────────
    try {
      if (process.env.FINCRA_ENABLED === 'true' && process.env.FINCRA_SECRET_KEY) {
        // Stub: would call Fincra /rates endpoint
        // const FincraAdapter = require('../payment/adapters/FincraAdapter');
        // const rate = await FincraAdapter.getExchangeRate(from, to);
        quotes.push({ source: 'fincra', rate: null, fee: 0, estimatedOutput: null, status: 'STUB' });
      }
    } catch (e) {
      logger.warn(`[SmartFXRouter] Fincra FX quote failed: ${e.message}`);
    }

    // ── Anchor FX ─────────────────────────────────────────────────────────────
    try {
      if (process.env.ANCHOR_ENABLED === 'true' && process.env.ANCHOR_SECRET_KEY) {
        // Stub: would call Anchor /rates endpoint when Anchor enables FX for the account
        quotes.push({ source: 'anchor', rate: null, fee: 0, estimatedOutput: null, status: 'STUB' });
      }
    } catch (e) {
      logger.warn(`[SmartFXRouter] Anchor FX quote failed: ${e.message}`);
    }

    // ── NOWPayments FX ────────────────────────────────────────────────────────
    try {
      if (process.env.NOWPAYMENTS_ENABLED !== 'false') {
        const NowPaymentsProvider = require('../../providers/nowpaymentsProvider');
        const rate = await NowPaymentsProvider.getRate(from, to, amount);
        if (rate && rate > 0) {
          quotes.push({
            source:          'nowpayments',
            rate:            rate,
            fee:             0,
            estimatedOutput: parseFloat((amount * rate).toFixed(8)),
            status:          'ACTIVE',
          });
        }
      }
    } catch (e) {
      logger.warn(`[SmartFXRouter] NOWPayments FX quote failed: ${e.message}`);
    }

    // Filter out stubs with no real rate for now
    return quotes.filter(q => q.rate !== null);
  },
};

module.exports = SmartFXRouter;
