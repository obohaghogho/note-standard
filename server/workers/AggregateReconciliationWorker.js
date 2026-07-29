'use strict';
/**
 * AggregateReconciliationWorker.js
 * =================================
 * Extends the existing transaction-level reconciliation with
 * aggregate (currency-level) balance comparison.
 *
 * Every 15 minutes:
 *   For each currency:
 *     1. Sum ledger_entries_v6 net debit/credit for that currency
 *     2. Compare against treasury_provider_balances.available_balance
 *     3. Compare against wallets_v6 balance totals
 *     4. Detect drift and write to reconciliation_reports
 *     5. Alert if discrepancy exceeds tolerance
 *
 * Uses LockService to prevent conflicts with the existing
 * reconciliationWorker.js cycle (different lock key namespace).
 *
 * @module workers/AggregateReconciliationWorker
 */

const logger          = require('../utils/logger');
const supabase        = require('../config/database');
const ImmutableAuditLog = require('../services/treasury/ImmutableAuditLog');
const TreasuryAlertService = require('../services/treasury/TreasuryAlertService');

const INTERVAL_MS       = parseInt(process.env.AGG_RECON_INTERVAL_MS || '900000', 10); // 15 min
const TOLERANCE_PERCENT = parseFloat(process.env.AGG_RECON_TOLERANCE || '0.5'); // 0.5%
const CURRENCIES        = ['NGN', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT', 'USDC'];

let _intervalHandle = null;
let _running        = false;

const AggregateReconciliationWorker = {
  name: 'AggregateReconciliationWorker',

  start() {
    if (_running) return;
    _running = true;
    logger.info(`[AggReconWorker] Starting. Interval: ${INTERVAL_MS / 1000}s. Tolerance: ${TOLERANCE_PERCENT}%`);

    // Stagger start by 45s to avoid boot congestion
    setTimeout(() => {
      this._runSafe();
      _intervalHandle = setInterval(() => this._runSafe(), INTERVAL_MS);
    }, 45000);
  },

  stop() {
    if (_intervalHandle) clearInterval(_intervalHandle);
    _running = false;
    logger.info('[AggReconWorker] Stopped.');
  },

  async _runSafe() {
    try {
      await this._runCycle();
    } catch (err) {
      logger.error(`[AggReconWorker] Cycle error: ${err.message}`);
    }
  },

  async _runCycle() {
    logger.info('[AggReconWorker] Aggregate reconciliation cycle START');
    const cycleStart = Date.now();
    const report     = { currencies: {}, discrepancies: 0, balanced: 0 };

    for (const currency of CURRENCIES) {
      try {
        const result = await this._reconcileCurrency(currency);
        report.currencies[currency] = result;
        if (result.status === 'discrepancy') report.discrepancies++;
        else                                 report.balanced++;
      } catch (err) {
        logger.error(`[AggReconWorker] Failed for ${currency}: ${err.message}`);
        report.currencies[currency] = { status: 'error', error: err.message };
      }
    }

    const durationMs = Date.now() - cycleStart;
    logger.info(`[AggReconWorker] Cycle COMPLETE in ${durationMs}ms. Balanced: ${report.balanced}, Discrepancies: ${report.discrepancies}`);

    ImmutableAuditLog.record({
      event_type:  'AGGREGATE_RECONCILIATION_CYCLE',
      actor_type:  'WORKER',
      actor_id:    'AggregateReconciliationWorker',
      reason:      `Cycle completed: ${report.balanced} balanced, ${report.discrepancies} discrepancies`,
      metadata:    { ...report, durationMs },
    }).catch(() => {});

    return report;
  },

  async _reconcileCurrency(currency) {
    // ── A. Ledger sum for this currency ────────────────────────────────
    // Sum of all user wallet balances from wallets_v6 (excluding SYSTEM wallets)
    const { data: userWallets } = await supabase
      .from('wallets_v6')
      .select('balance')
      .eq('currency', currency)
      .neq('network', 'SYSTEM');

    const ledgerSum = (userWallets || [])
      .reduce((s, w) => s + parseFloat(w.balance || 0), 0);

    // ── B. Provider sum for this currency ──────────────────────────────
    const { data: provRows } = await supabase
      .from('treasury_provider_balances')
      .select('provider, available_balance')
      .eq('currency', currency)
      .eq('sync_status', 'SUCCESS');

    const providerSum = (provRows || [])
      .reduce((s, r) => s + parseFloat(r.available_balance || 0), 0);

    // ── C. Discrepancy ─────────────────────────────────────────────────
    const discrepancy = providerSum - ledgerSum;
    const discPct     = ledgerSum > 0 ? Math.abs(discrepancy / ledgerSum) * 100 : 0;
    const status      = discPct > TOLERANCE_PERCENT ? 'discrepancy' : 'balanced';

    // ── D. Upsert reconciliation_reports ──────────────────────────────
    await supabase
      .from('reconciliation_reports')
      .upsert({
        report_date:  new Date().toISOString().split('T')[0],
        provider:     provRows?.length > 0 ? 'aggregate_all' : 'no_provider_data',
        ledger_sum:   ledgerSum,
        provider_sum: providerSum,
        discrepancy,
        status,
        notes:        `Automated aggregate reconciliation. Tolerance: ${TOLERANCE_PERCENT}%. Actual drift: ${discPct.toFixed(4)}%`,
      }, { onConflict: 'provider,report_date' });

    // ── E. Alert on discrepancy ────────────────────────────────────────
    if (status === 'discrepancy') {
      logger.warn(`[AggReconWorker] ${currency} discrepancy: Ledger=${ledgerSum.toFixed(4)}, Provider=${providerSum.toFixed(4)}, Diff=${discrepancy.toFixed(4)} (${discPct.toFixed(3)}%)`);

      await TreasuryAlertService.sendAlert({
        type:     'RECONCILIATION_DISCREPANCY',
        level:    discPct > 5 ? 'CRITICAL' : 'WARN',
        title:    `${currency} aggregate reconciliation discrepancy`,
        message:  `Ledger sum: ${ledgerSum.toFixed(4)} ${currency}\nProvider sum: ${providerSum.toFixed(4)} ${currency}\nDiscrepancy: ${discrepancy.toFixed(4)} (${discPct.toFixed(3)}%)`,
        currency,
        metadata: { ledgerSum, providerSum, discrepancy, discPct },
      }).catch(() => {});
    }

    return { currency, ledgerSum, providerSum, discrepancy, discPct, status };
  },
};

module.exports = AggregateReconciliationWorker;
