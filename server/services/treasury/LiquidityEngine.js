'use strict';
/**
 * LiquidityEngine.js
 * ==================
 * Analyses real-time liquidity position across all currencies.
 *
 * Produces:
 *   - Liquidity Available  (what can be moved out right now)
 *   - Liquidity Needed     (projected withdrawal demand)
 *   - Liquidity Gap        (needed - available)
 *   - Projected Balance    (available + expected inflows - expected outflows)
 *   - Recommendations      (actionable guidance for treasury operators)
 *
 * Integration:
 *   - Reads from payout_requests, transactions, treasury_provider_balances
 *   - Writes recommendations to liquidity_recommendations
 *   - Does NOT modify any wallet or ledger records
 *
 * @module services/treasury/LiquidityEngine
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT', 'USDC'];

// Conservative look-ahead window for projections
const PROJECTION_HOURS = 24;

class LiquidityEngine {

  // ── 1. Compute Liquidity for One Currency ─────────────────────────────────

  /**
   * @param {string} currency
   * @returns {Promise<object>} Liquidity report
   */
  async computeForCurrency(currency) {
    const cur = currency.toUpperCase();
    const now = new Date();
    const lookAhead = new Date(now.getTime() + PROJECTION_HOURS * 60 * 60 * 1000);

    // ── A. Available provider liquidity ──────────────────────────────────
    const { data: provRow } = await supabase
      .from('treasury_provider_balances')
      .select('available_balance, pending_balance')
      .eq('currency', cur)
      .eq('sync_status', 'SUCCESS');

    const liquidityAvailable = (provRow || [])
      .reduce((s, r) => s + parseFloat(r.available_balance || 0), 0);
    const pendingInflows = (provRow || [])
      .reduce((s, r) => s + parseFloat(r.pending_balance || 0), 0);

    // ── B. Pending outflows (payout_requests) ────────────────────────────
    const { data: pendingPayouts } = await supabase
      .from('payout_requests')
      .select('net_amount, amount')
      .eq('currency', cur)
      .in('status', ['pending', 'pending_review', 'approved', 'processing']);

    const liquidityNeeded = (pendingPayouts || [])
      .reduce((s, p) => s + parseFloat(p.net_amount || p.amount || 0), 0);

    // ── C. Expected deposits (PENDING transactions in next 24h) ──────────
    const { data: expectedDeposits } = await supabase
      .from('transactions')
      .select('amount')
      .eq('currency', cur)
      .eq('type', 'DEPOSIT')
      .in('status', ['PENDING', 'PROCESSING'])
      .gte('created_at', new Date(now - 6 * 60 * 60 * 1000).toISOString()); // Last 6h

    const expectedInflows = (expectedDeposits || [])
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    // ── D. Pending settlements (outbound) ────────────────────────────────
    const { data: pendingSettlements } = await supabase
      .from('settlements')
      .select('net_amount')
      .eq('currency', cur)
      .eq('direction', 'OUTBOUND')
      .in('current_stage', ['INITIATED', 'PROVIDER_PENDING', 'PROVIDER_CONFIRMED']);

    const expectedOutflows = (pendingSettlements || [])
      .reduce((s, s2) => s + parseFloat(s2.net_amount || 0), 0);

    // ── E. Compute gap and projections ───────────────────────────────────
    const liquidityGap       = Math.max(0, liquidityNeeded - liquidityAvailable);
    const projectedBalance   = liquidityAvailable + pendingInflows + expectedInflows - expectedOutflows - liquidityNeeded;
    const hasGap             = liquidityGap > 0;
    const severity           = this._classifySeverity(liquidityAvailable, liquidityNeeded);

    const report = {
      currency:            cur,
      liquidity_available: liquidityAvailable,
      liquidity_needed:    liquidityNeeded,
      liquidity_gap:       liquidityGap,
      pending_inflows:     pendingInflows,
      expected_inflows:    expectedInflows,
      expected_outflows:   expectedOutflows,
      projected_balance:   projectedBalance,
      has_gap:             hasGap,
      severity,
      computed_at:         now.toISOString(),
    };

    // ── F. Write recommendations if gap detected ──────────────────────────
    if (hasGap || severity !== 'OK') {
      await this._writeRecommendation(report);
    }

    return report;
  }

  // ── 2. Compute All Currencies ─────────────────────────────────────────────

  /**
   * Runs liquidity analysis for every supported currency.
   * @returns {Promise<object>} Map of currency → liquidity report
   */
  async computeAll() {
    const results = {};
    for (const currency of SUPPORTED_CURRENCIES) {
      try {
        results[currency] = await this.computeForCurrency(currency);
      } catch (err) {
        logger.error(`[LiquidityEngine] computeAll failed for ${currency}: ${err.message}`);
        results[currency] = { currency, severity: 'ERROR', error: err.message };
      }
    }
    return results;
  }

  // ── 3. Get Open Recommendations ───────────────────────────────────────────

  /**
   * Returns unresolved liquidity recommendations for the dashboard.
   * @returns {Promise<Array>}
   */
  async getOpenRecommendations() {
    const { data } = await supabase
      .from('liquidity_recommendations')
      .select('*')
      .eq('status', 'OPEN')
      .order('generated_at', { ascending: false })
      .limit(50);
    return data || [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _classifySeverity(available, needed) {
    if (needed === 0) return 'OK';
    const coverage = available / needed;
    if (coverage >= 1.5)  return 'OK';
    if (coverage >= 1.1)  return 'INFO';
    if (coverage >= 1.0)  return 'WARN';
    if (coverage >= 0.8)  return 'CRITICAL';
    return 'EMERGENCY';
  }

  async _writeRecommendation(report) {
    const { currency, liquidity_gap, liquidity_available, liquidity_needed, severity } = report;

    const typeMap = {
      OK:        null,
      INFO:      'TOP_UP_PROVIDER',
      WARN:      'MOVE_FUNDS',
      CRITICAL:  'FREEZE_WITHDRAWALS',
      EMERGENCY: 'ENABLE_SAFE_MODE',
    };

    const recType = typeMap[severity];
    if (!recType) return;

    const titles = {
      TOP_UP_PROVIDER:   `Low liquidity buffer for ${currency}`,
      MOVE_FUNDS:        `Liquidity gap detected for ${currency} — consider rebalancing`,
      FREEZE_WITHDRAWALS:`Critical liquidity shortage for ${currency} — freeze withdrawals recommended`,
      ENABLE_SAFE_MODE:  `EMERGENCY: ${currency} liquidity below 80% coverage — SAFE_MODE required`,
    };

    try {
      await supabase.from('liquidity_recommendations').insert({
        currency,
        recommendation_type: recType,
        severity: severity === 'EMERGENCY' ? 'CRITICAL' : (severity === 'OK' ? 'INFO' : severity),
        title:              titles[recType],
        description:        `Available: ${liquidity_available.toFixed(2)} ${currency}. Needed: ${liquidity_needed.toFixed(2)} ${currency}. Gap: ${liquidity_gap.toFixed(2)} ${currency}.`,
        current_available:  liquidity_available,
        required_amount:    liquidity_needed,
        gap_amount:         liquidity_gap,
        status:             'OPEN',
      });
    } catch (err) {
      logger.error(`[LiquidityEngine] Failed to write recommendation for ${currency}: ${err.message}`);
    }
  }
}

module.exports = new LiquidityEngine();
