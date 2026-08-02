'use strict';

/**
 * FXQuoteService.js
 * =================
 * FX Quote Engine for NoteStandard.
 * Handles rate locking with TTL (30-120s), spread calculation, and quote acceptance.
 */
class FXQuoteService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    this.defaultTtlMs = options.defaultTtlMs || 60000; // 60 seconds TTL
    this.inMemoryQuotes = new Map();
  }

  /**
   * Request and lock an FX rate quote
   */
  async createQuote(params) {
    const { baseCurrency, quoteCurrency, amount, spread = 0.005, provider = 'fincra', traceId } = params;
    if (!baseCurrency || !quoteCurrency) throw new Error('baseCurrency and quoteCurrency are required');
    if (!amount || amount <= 0) throw new Error('amount must be positive');

    // Simulated market mid-rate (e.g. 1 USD = 1500 NGN or 1 NGN = 0.00067 USD)
    let midRate = 1.0;
    if (baseCurrency.toUpperCase() === 'USD' && quoteCurrency.toUpperCase() === 'NGN') midRate = 1500.0;
    else if (baseCurrency.toUpperCase() === 'NGN' && quoteCurrency.toUpperCase() === 'USD') midRate = 0.000667;

    const lockedRate = midRate * (1 - spread);
    const convertedAmount = parseFloat(amount) * lockedRate;
    const quoteId = `fxq_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const expiresAt = new Date(Date.now() + this.defaultTtlMs);

    const quoteRecord = {
      id: `quote_${Date.now()}`,
      quote_id: quoteId,
      base_currency: baseCurrency.toUpperCase(),
      quote_currency: quoteCurrency.toUpperCase(),
      mid_rate: midRate,
      spread,
      locked_rate: lockedRate,
      amount: parseFloat(amount),
      converted_amount: parseFloat(convertedAmount.toFixed(4)),
      provider,
      expires_at: expiresAt,
      status: 'ACTIVE',
      trace_id: traceId || `trace_fx_${Date.now()}`,
      created_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.fx_quotes 
           (quote_id, base_currency, quote_currency, mid_rate, spread, locked_rate, amount, converted_amount, provider, expires_at, status, trace_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11)`,
          [quoteRecord.quote_id, quoteRecord.base_currency, quoteRecord.quote_currency, quoteRecord.mid_rate, quoteRecord.spread, quoteRecord.locked_rate, quoteRecord.amount, quoteRecord.converted_amount, quoteRecord.provider, quoteRecord.expires_at, quoteRecord.trace_id]
        );
      } catch (err) {
        // Fallback
      }
    }

    this.inMemoryQuotes.set(quoteId, quoteRecord);
    return quoteRecord;
  }

  /**
   * Accept and execute an FX quote
   */
  async acceptQuote(quoteId) {
    const quote = this.inMemoryQuotes.get(quoteId);
    if (!quote) throw new Error(`FX_QUOTE_NOT_FOUND: Quote '${quoteId}' not found.`);

    if (quote.status !== 'ACTIVE') {
      throw new Error(`FX_QUOTE_INVALID_STATUS: Quote '${quoteId}' is ${quote.status}.`);
    }

    if (new Date() > quote.expires_at) {
      quote.status = 'EXPIRED';
      throw new Error(`FX_QUOTE_EXPIRED: Quote '${quoteId}' has expired.`);
    }

    quote.status = 'ACCEPTED';

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `UPDATE public.fx_quotes SET status = 'ACCEPTED' WHERE quote_id = $1`,
          [quoteId]
        );
      } catch (err) {
        // Fallback
      }
    }

    return quote;
  }
}

module.exports = FXQuoteService;
