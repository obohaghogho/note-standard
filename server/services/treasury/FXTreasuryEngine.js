'use strict';
/**
 * FXTreasuryEngine.js
 * ===================
 * Records every FX swap execution for P&L tracking and
 * currency exposure management.
 *
 * CRITICAL DESIGN RULE:
 *   This service is called AFTER the atomic swap RPC completes.
 *   A failure here MUST NOT roll back the swap.
 *   All writes are fire-and-forget from the swap caller's perspective.
 *
 * Provides:
 *   - Per-trade FX position recording
 *   - Daily exposure summary aggregation
 *   - Realized/unrealized P&L calculation
 *   - Rate traceability (source, confidence, age)
 *
 * @module services/treasury/FXTreasuryEngine
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');
const ImmutableAuditLog = require('./ImmutableAuditLog');

class FXTreasuryEngine {

  // ── 1. Record a Swap Execution ────────────────────────────────────────────

  /**
   * Records an FX trade in fx_positions. Call this after execute_swap_v6 succeeds.
   *
   * @param {object} tradeData
   * @param {string}  tradeData.transactionId
   * @param {string}  [tradeData.swapQuoteId]
   * @param {string}  [tradeData.idempotencyKey]
   * @param {string}  tradeData.fromCurrency
   * @param {string}  tradeData.toCurrency
   * @param {number}  tradeData.fromAmount
   * @param {number}  tradeData.toAmount
   * @param {number}  tradeData.feeAmount
   * @param {number}  tradeData.executionRate
   * @param {number}  [tradeData.marketRate]
   * @param {string}  [tradeData.rateSource]   - 'coingecko' | 'exchangerate_api' | 'snapshot'
   * @param {string}  [tradeData.rateSnapshotId]
   * @param {number}  [tradeData.rateConfidence]
   * @param {string}  [tradeData.rateMode]     - 'LIVE' | 'LKG' | 'FALLBACK'
   * @param {number}  [tradeData.priceAgeSeconds]
   * @param {string}  [tradeData.userId]
   * @param {string}  [tradeData.positionType] - default 'CUSTOMER_SWAP'
   * @returns {Promise<void>}   Always resolves — never rejects to caller
   */
  async recordTrade(tradeData) {
    try {
      const {
        transactionId, swapQuoteId, idempotencyKey,
        fromCurrency, toCurrency,
        fromAmount, toAmount, feeAmount = 0,
        executionRate, marketRate,
        rateSource, rateSnapshotId, rateConfidence, rateMode, priceAgeSeconds,
        userId,
        positionType = 'CUSTOMER_SWAP',
      } = tradeData;

      // Spread in execution_rate units and basis points
      const spread    = marketRate ? executionRate - marketRate : null;
      const spreadBps = spread && marketRate
        ? parseFloat(((spread / marketRate) * 10000).toFixed(4))
        : null;

      const netFromAmount = fromAmount - feeAmount;

      const row = {
        swap_quote_id:    swapQuoteId    || null,
        transaction_id:   transactionId  || null,
        idempotency_key:  idempotencyKey || null,
        from_currency:    fromCurrency.toUpperCase(),
        to_currency:      toCurrency.toUpperCase(),
        from_amount:      fromAmount,
        to_amount:        toAmount,
        fee_amount:       feeAmount,
        net_from_amount:  netFromAmount,
        execution_rate:   executionRate,
        market_rate:      marketRate      || null,
        spread:           spread          || null,
        spread_bps:       spreadBps       || null,
        rate_source:      rateSource      || null,
        rate_snapshot_id: rateSnapshotId  || null,
        rate_confidence:  rateConfidence  || null,
        rate_mode:        rateMode        || null,
        price_age_seconds: priceAgeSeconds || null,
        position_type:    positionType,
        user_id:          userId           || null,
        executed_at:      new Date().toISOString(),
      };

      const { error } = await supabase.from('fx_positions').insert(row);
      if (error) {
        logger.error(`[FXTreasuryEngine] recordTrade insert error: ${error.message}`);
        return; // Never throw
      }

      logger.info(`[FXTreasuryEngine] Trade recorded: ${fromAmount} ${fromCurrency} → ${toAmount} ${toCurrency} @ ${executionRate}`);

      // Fire-and-forget exposure update
      this._updateExposureSummary(fromCurrency, toCurrency, fromAmount, toAmount, executionRate, feeAmount)
        .catch(e => logger.warn(`[FXTreasuryEngine] Exposure update failed (non-critical): ${e.message}`));

      // Audit log
      ImmutableAuditLog.record({
        event_type:    'FX_POSITION_RECORDED',
        event_subtype: positionType,
        subject_type:  'FX_TRADE',
        subject_id:    transactionId || idempotencyKey,
        currency:      fromCurrency,
        amount:        fromAmount,
        reason:        `${fromAmount} ${fromCurrency} → ${toAmount} ${toCurrency} @ ${executionRate}`,
        metadata:      { toCurrency, executionRate, spread, spreadBps, rateSource, rateMode },
      }).catch(() => {});

    } catch (err) {
      // Swallow all errors — swap must not be blocked
      logger.error(`[FXTreasuryEngine] recordTrade unhandled error: ${err.message}`);
    }
  }

  // ── 2. Get Exposure Summary ───────────────────────────────────────────────

  /**
   * Returns today's FX exposure summary grouped by currency pair.
   * @returns {Promise<Array>}
   */
  async getExposureSummary() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('fx_exposure_summary')
      .select('*')
      .eq('summary_date', today)
      .order('total_volume', { ascending: false });
    return data || [];
  }

  // ── 3. Get Daily P&L ─────────────────────────────────────────────────────

  /**
   * Sums realized spread P&L by currency pair for a given date.
   * @param {string} [date]  ISO date string, defaults to today
   * @returns {Promise<Array>}
   */
  async getDailyPnL(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('fx_positions')
      .select('from_currency, to_currency, fee_amount, spread_bps')
      .gte('executed_at', `${targetDate}T00:00:00Z`)
      .lt('executed_at',  `${targetDate}T23:59:59Z`);

    if (!data) return [];

    const byPair = {};
    for (const pos of data) {
      const pair = `${pos.from_currency}/${pos.to_currency}`;
      if (!byPair[pair]) byPair[pair] = { pair, fee_total: 0, trade_count: 0, avg_spread_bps: 0 };
      byPair[pair].fee_total    += parseFloat(pos.fee_amount || 0);
      byPair[pair].trade_count  += 1;
      byPair[pair].avg_spread_bps = pos.spread_bps
        ? (byPair[pair].avg_spread_bps + parseFloat(pos.spread_bps)) / 2
        : byPair[pair].avg_spread_bps;
    }

    return Object.values(byPair);
  }

  // ── 4. Get Recent Trades ─────────────────────────────────────────────────

  async getRecentTrades(limit = 50) {
    const { data } = await supabase
      .from('fx_positions')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _updateExposureSummary(fromCurrency, toCurrency, fromAmount, toAmount, rate, fee) {
    const pair      = `${fromCurrency.toUpperCase()}/${toCurrency.toUpperCase()}`;
    const today     = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('fx_exposure_summary')
      .select('*')
      .eq('currency_pair', pair)
      .eq('summary_date', today)
      .maybeSingle();

    if (existing) {
      const newCount  = existing.trade_count + 1;
      const newVolume = parseFloat(existing.total_volume) + fromAmount;
      const newAvgRate = ((parseFloat(existing.avg_rate) * existing.trade_count) + rate) / newCount;
      const newPnL    = parseFloat(existing.realized_pnl) + fee;

      await supabase
        .from('fx_exposure_summary')
        .update({
          total_volume:  newVolume,
          avg_rate:      newAvgRate,
          trade_count:   newCount,
          realized_pnl:  newPnL,
          last_trade_at: new Date().toISOString(),
          calculated_at: new Date().toISOString(),
        })
        .eq('currency_pair', pair)
        .eq('summary_date', today);
    } else {
      await supabase.from('fx_exposure_summary').insert({
        currency_pair: pair,
        net_position:  fromAmount,
        total_volume:  fromAmount,
        avg_rate:      rate,
        realized_pnl:  fee,
        trade_count:   1,
        last_trade_at: new Date().toISOString(),
        summary_date:  today,
      });
    }
  }
}

module.exports = new FXTreasuryEngine();
