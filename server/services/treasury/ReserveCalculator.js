'use strict';
/**
 * ReserveCalculator.js
 * ====================
 * Computes reserve ratios for every supported currency.
 *
 * Reserve Ratio = External Provider Assets / Internal User Liabilities × 100
 *
 * A ratio of 100% means every user's balance is exactly backed.
 * Above 100% = surplus. Below 100% = deficit.
 *
 * Key safety rules:
 *   - SYSTEM wallets are EXCLUDED from user liabilities
 *   - System transit wallets are tracked separately as float
 *   - A single API timeout never produces a 0% ratio — it is treated as STALE
 *   - Results are persisted to reserve_ratios for alerting and trending
 *
 * @module services/treasury/ReserveCalculator
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT', 'USDC'];

class ReserveCalculator {

  // ── 1. Calculate Single Currency ─────────────────────────────────────────

  /**
   * Computes the reserve ratio for one currency across all providers.
   *
   * @param {string} currency
   * @returns {Promise<object>} Reserve report for this currency
   */
  async calculateForCurrency(currency) {
    const cur = currency.toUpperCase();

    // ── A. External provider assets ─────────────────────────────────────
    // Sum available_balance across all providers for this currency.
    // Only count rows with sync_status = 'SUCCESS' (exclude STALE/FAILED).
    const { data: providerRows, error: provErr } = await supabase
      .from('treasury_provider_balances')
      .select('provider, available_balance, pending_balance, sync_status')
      .eq('currency', cur)
      .eq('sync_status', 'SUCCESS');

    if (provErr) {
      logger.error(`[ReserveCalculator] DB error fetching provider balances for ${cur}: ${provErr.message}`);
    }

    const externalAvailable = (providerRows || [])
      .reduce((sum, r) => sum + parseFloat(r.available_balance || 0), 0);
    const externalPending = (providerRows || [])
      .reduce((sum, r) => sum + parseFloat(r.pending_balance || 0), 0);
    const externalTotal = externalAvailable + externalPending;

    // ── B. Internal user liabilities ────────────────────────────────────
    // Sum wallet balances for real user wallets only.
    // CRITICAL: Exclude network='SYSTEM' rows to avoid counting internal
    // treasury wallets as user funds. This is the most important filter.
    const { data: userWallets, error: walletErr } = await supabase
      .from('wallets_v6')
      .select('balance')
      .eq('currency', cur)
      .neq('network', 'SYSTEM');

    if (walletErr) {
      logger.error(`[ReserveCalculator] DB error fetching user wallets for ${cur}: ${walletErr.message}`);
    }

    const internalUserTotal = (userWallets || [])
      .reduce((sum, w) => sum + parseFloat(w.balance || 0), 0);

    // ── C. System float (transit wallets) ───────────────────────────────
    const { data: floatWallets } = await supabase
      .from('wallets_v6')
      .select('balance')
      .eq('currency', cur)
      .eq('network', 'SYSTEM')
      .like('address', 'SYSTEM_TRANSIT%');

    const internalSystemFloat = (floatWallets || [])
      .reduce((sum, w) => sum + parseFloat(w.balance || 0), 0);

    // Net user liability = user wallets only (not system float)
    const netUserLiability = internalUserTotal;

    // ── D. Reserve ratio calculation ─────────────────────────────────────
    let reserveRatio = 100.0000;
    if (netUserLiability > 0) {
      reserveRatio = parseFloat(
        ((externalAvailable / netUserLiability) * 100).toFixed(4)
      );
    } else if (externalAvailable > 0) {
      reserveRatio = 999.9999; // Surplus with no users — 'infinite' reserve
    }
    // If both are 0, ratio = 100 (perfectly balanced zero state)

    const reserveSurplus = parseFloat(
      (externalAvailable - netUserLiability).toFixed(8)
    );

    const liquidityRatio = netUserLiability > 0
      ? parseFloat(((externalAvailable / (netUserLiability + externalPending)) * 100).toFixed(4))
      : 100.0000;

    const exposureAmount = Math.max(0, netUserLiability - externalAvailable);

    // ── E. Determine status ──────────────────────────────────────────────
    const { data: threshold } = await supabase
      .from('reserve_thresholds')
      .select('warn_below, critical_below, freeze_below')
      .eq('currency', cur)
      .eq('is_active', true)
      .maybeSingle();

    const warnBelow     = threshold?.warn_below     ?? 105.00;
    const criticalBelow = threshold?.critical_below ?? 100.00;

    let status = 'OK';
    let alertLevel = null;
    if (reserveRatio < criticalBelow) {
      status     = reserveRatio < 0 ? 'DEFICIT' : 'CRITICAL';
      alertLevel = 'CRITICAL';
    } else if (reserveRatio < warnBelow) {
      status     = 'WARNING';
      alertLevel = 'WARN';
    }

    // ── F. Determine primary provider ────────────────────────────────────
    const primaryProvider = (providerRows && providerRows.length > 0)
      ? providerRows.sort((a, b) => b.available_balance - a.available_balance)[0].provider
      : 'unknown';

    const report = {
      currency,
      provider:             primaryProvider,
      external_available:   externalAvailable,
      external_pending:     externalPending,
      external_total:       externalTotal,
      internal_user_total:  internalUserTotal,
      internal_system_float: internalSystemFloat,
      net_user_liability:   netUserLiability,
      reserve_ratio:        reserveRatio,
      reserve_surplus:      reserveSurplus,
      liquidity_ratio:      liquidityRatio,
      exposure_amount:      exposureAmount,
      status,
      alert_level:          alertLevel,
      calculation_method:   'SCHEDULED',
    };

    // ── G. Persist to reserve_ratios ─────────────────────────────────────
    try {
      await supabase.from('reserve_ratios').insert(report);
    } catch (insertErr) {
      logger.error(`[ReserveCalculator] Failed to persist reserve ratio for ${cur}: ${insertErr.message}`);
    }

    return report;
  }

  // ── 2. Calculate All Currencies ───────────────────────────────────────────

  /**
   * Runs reserve calculation for every supported currency.
   * Failures in one currency do not block others.
   *
   * @returns {Promise<object>} Map of currency → reserve report
   */
  async calculateAll() {
    const results = {};

    for (const currency of SUPPORTED_CURRENCIES) {
      try {
        results[currency] = await this.calculateForCurrency(currency);
      } catch (err) {
        logger.error(`[ReserveCalculator] calculateAll failed for ${currency}: ${err.message}`);
        results[currency] = { currency, status: 'ERROR', error: err.message };
      }
    }

    const criticalCurrencies = Object.values(results)
      .filter(r => r.status === 'CRITICAL' || r.status === 'DEFICIT')
      .map(r => r.currency);

    if (criticalCurrencies.length > 0) {
      logger.error(`[ReserveCalculator] CRITICAL reserve deficit detected for: ${criticalCurrencies.join(', ')}`);
    }

    return results;
  }

  // ── 3. Get Latest Ratios ──────────────────────────────────────────────────

  /**
   * Returns the most recent reserve ratio entry for each currency.
   *
   * @returns {Promise<Array>}
   */
  async getLatestRatios() {
    const results = [];
    for (const currency of SUPPORTED_CURRENCIES) {
      const { data } = await supabase
        .from('reserve_ratios')
        .select('*')
        .eq('currency', currency)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) results.push(data);
    }
    return results;
  }

  // ── 4. Get Reserve History ────────────────────────────────────────────────

  /**
   * Returns time-series reserve data for a currency (for dashboard charts).
   *
   * @param {string} currency
   * @param {number} [hours=24]
   * @returns {Promise<Array>}
   */
  async getReserveHistory(currency, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('reserve_ratios')
      .select('reserve_ratio, status, calculated_at, external_available, net_user_liability')
      .eq('currency', currency.toUpperCase())
      .gte('calculated_at', since)
      .order('calculated_at', { ascending: true });
    return data || [];
  }
}

module.exports = new ReserveCalculator();
