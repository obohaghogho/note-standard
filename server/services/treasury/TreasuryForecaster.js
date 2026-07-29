'use strict';
/**
 * TreasuryForecaster.js
 * =====================
 * 24h / 72h / 7d liquidity projections using velocity extrapolation.
 *
 * Methodology:
 *   1. Compute deposit and withdrawal velocity from the last 7 days of transactions
 *   2. Project forward using: projected = current + (deposits × hours) - (withdrawals × hours) - (payouts × hours)
 *   3. Apply confidence degradation over time (72h less confident than 24h)
 *   4. Flag deficits and reserve threshold breaches in advance
 *
 * Enables proactive treasury management:
 *   "Current NGN reserve: ₦48M. Expected reserve tomorrow: ₦25M."
 *
 * @module services/treasury/TreasuryForecaster
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const FIAT_CURRENCIES  = ['NGN', 'USD', 'EUR', 'GBP'];
const HORIZONS         = ['24H', '72H', '7D'];
const HORIZON_HOURS    = { '24H': 24, '72H': 72, '7D': 168 };
const CONFIDENCE_DECAY = { '24H': 0.95, '72H': 0.80, '7D': 0.65 };

const TreasuryForecaster = {
  /**
   * Generate forecasts for all currencies and all horizons.
   */
  async generateAll() {
    const results = {};
    for (const currency of FIAT_CURRENCIES) {
      results[currency] = await this.generateForCurrency(currency);
    }
    return results;
  },

  /**
   * Generate all horizon forecasts for one currency.
   */
  async generateForCurrency(currency) {
    const up = String(currency).toUpperCase();
    const [velocity, currentBalance, currentLiability] = await Promise.all([
      this._computeVelocity(up),
      this._getCurrentBalance(up),
      this._getCurrentLiability(up),
    ]);

    const currentReserveRatio = currentLiability > 0
      ? parseFloat(((currentBalance / currentLiability) * 100).toFixed(4))
      : 999;

    const forecasts = [];

    for (const horizon of HORIZONS) {
      const hours     = HORIZON_HOURS[horizon];
      const confidence = CONFIDENCE_DECAY[horizon];

      const projectedDeposits    = velocity.deposit_per_hour    * hours;
      const projectedWithdrawals = velocity.withdrawal_per_hour * hours;
      const projectedPayouts     = velocity.payout_per_hour     * hours;
      const projectedNet         = projectedDeposits - projectedWithdrawals - projectedPayouts;
      const projectedBalance     = Math.max(0, currentBalance + projectedNet);

      const projectedReserveRatio = currentLiability > 0
        ? parseFloat(((projectedBalance / currentLiability) * 100).toFixed(4))
        : 999;

      const isDeficitForecast    = projectedBalance < currentLiability;
      const reserveBelowWarn     = projectedReserveRatio < 105;
      const reserveBelowCritical = projectedReserveRatio < 100;

      const forecast = {
        currency:               up,
        forecast_horizon:       horizon,
        current_balance:        parseFloat(currentBalance.toFixed(8)),
        current_liability:      parseFloat(currentLiability.toFixed(8)),
        current_reserve_ratio:  currentReserveRatio,
        projected_deposits:     parseFloat(projectedDeposits.toFixed(8)),
        projected_withdrawals:  parseFloat(projectedWithdrawals.toFixed(8)),
        projected_payouts:      parseFloat(projectedPayouts.toFixed(8)),
        projected_balance:      parseFloat(projectedBalance.toFixed(8)),
        projected_reserve_ratio: projectedReserveRatio,
        deposit_velocity_1h:    parseFloat(velocity.deposit_per_hour.toFixed(8)),
        withdrawal_velocity_1h: parseFloat(velocity.withdrawal_per_hour.toFixed(8)),
        payout_velocity_1h:     parseFloat(velocity.payout_per_hour.toFixed(8)),
        is_deficit_forecast:    isDeficitForecast,
        reserve_below_warn:     reserveBelowWarn,
        reserve_below_critical: reserveBelowCritical,
        confidence,
        methodology:            'VELOCITY_EXTRAPOLATION',
        generated_at:           new Date().toISOString(),
      };

      // Persist
      await supabase
        .from('treasury_forecasts')
        .insert(forecast)
        .catch(e => logger.warn(`[TreasuryForecaster] Persist failed ${up}/${horizon}: ${e.message}`));

      forecasts.push(forecast);
    }

    logger.info(`[TreasuryForecaster] ${up}: 24h=${forecasts[0].projected_balance.toFixed(0)} | 72h=${forecasts[1].projected_balance.toFixed(0)}`);
    return forecasts;
  },

  /**
   * Get latest forecasts from DB (fast path for dashboard).
   */
  async getLatestForecasts(currency = null) {
    let q = supabase
      .from('treasury_forecasts')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(100);
    if (currency) q = q.eq('currency', String(currency).toUpperCase());
    const { data } = await q;
    if (!data) return [];

    // Dedupe to most recent per currency + horizon
    const seen = new Map();
    return data.filter(f => {
      const k = `${f.currency}:${f.forecast_horizon}`;
      if (seen.has(k)) return false;
      seen.set(k, true);
      return true;
    });
  },

  // ── Internals ─────────────────────────────────────────────────────────────────

  async _computeVelocity(currency) {
    // Use last 7 days of completed transactions to compute hourly velocity
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const HOURS_IN_WINDOW = 7 * 24;

    const { data: txns } = await supabase
      .from('transactions')
      .select('type, amount')
      .eq('currency', currency)
      .in('status', ['COMPLETED', 'CONFIRMED', 'SUCCESS'])
      .gte('created_at', since);

    const deposits    = (txns || []).filter(t => t.type === 'DEPOSIT');
    const withdrawals = (txns || []).filter(t => t.type === 'WITHDRAWAL');
    const payouts     = (txns || []).filter(t => t.type === 'PAYOUT' || t.type === 'TRANSFER');

    const sumAmount = arr => arr.reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    return {
      deposit_per_hour:    sumAmount(deposits)    / HOURS_IN_WINDOW,
      withdrawal_per_hour: sumAmount(withdrawals) / HOURS_IN_WINDOW,
      payout_per_hour:     sumAmount(payouts)     / HOURS_IN_WINDOW,
      deposit_count_7d:    deposits.length,
      withdrawal_count_7d: withdrawals.length,
    };
  },

  async _getCurrentBalance(currency) {
    const { data } = await supabase
      .from('treasury_provider_balances')
      .select('available_balance')
      .eq('currency', currency)
      .eq('sync_status', 'SUCCESS');
    return (data || []).reduce((s, b) => s + parseFloat(b.available_balance || 0), 0);
  },

  async _getCurrentLiability(currency) {
    const { data } = await supabase
      .from('wallets_v6')
      .select('balance')
      .eq('currency', currency)
      .neq('network', 'SYSTEM');
    return (data || []).reduce((s, w) => s + parseFloat(w.balance || 0), 0);
  },
};

module.exports = TreasuryForecaster;
