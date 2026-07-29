'use strict';
/**
 * AnchorReconciliation.js
 * =======================
 * Anchor-specific reconciliation: compares Anchor API transaction history
 * against the internal ledger to detect discrepancies.
 *
 * Part of the NightlyReconciliationPipeline (stage: provider_txns).
 *
 * @module services/anchor/AnchorReconciliation
 */

const logger   = require('../../utils/logger');
const supabase = require('../../config/database');

const AnchorReconciliation = {
  /**
   * Reconcile Anchor transactions for a date range.
   * Compares provider records against internal ledger.
   *
   * @param {string} runId         - reconciliation_runs.id (for line items)
   * @param {Date}   dateFrom
   * @param {Date}   dateTo
   * @returns {{ matched, discrepancies, internalOnly, providerOnly }}
   */
  async reconcile(runId, dateFrom, dateTo) {
    logger.info(`[AnchorReconciliation] Reconciling ${dateFrom.toISOString()} → ${dateTo.toISOString()}`);

    // ── 1. Fetch internal records for Anchor ─────────────────────────────────
    const { data: internalTxns } = await supabase
      .from('settlement_positions')
      .select('provider_reference, currency, gross_amount, settlement_stage, created_at')
      .eq('provider', 'anchor')
      .gte('created_at', dateFrom.toISOString())
      .lte('created_at', dateTo.toISOString());

    const internalMap = new Map();
    for (const t of (internalTxns || [])) {
      internalMap.set(t.provider_reference, t);
    }

    // ── 2. Fetch from Anchor API ──────────────────────────────────────────────
    let providerTxns = [];
    try {
      const AnchorProvider = require('../payment/providers/AnchorProvider');
      const provider = new AnchorProvider();
      if (provider.isEnabled) {
        const { data: fromAnchor } = await supabase
          .from('anchor_incoming_deposits')
          .select('reference, amount, currency, status, received_at')
          .gte('received_at', dateFrom.toISOString())
          .lte('received_at', dateTo.toISOString());
        providerTxns = fromAnchor || [];
      }
    } catch (err) {
      logger.warn(`[AnchorReconciliation] Could not fetch Anchor API records: ${err.message}`);
    }

    const providerMap = new Map();
    for (const t of providerTxns) {
      providerMap.set(t.reference, t);
    }

    // ── 3. Compare ────────────────────────────────────────────────────────────
    let matched     = 0;
    let discrepancies = 0;
    const lineItems = [];

    // Check all internal records against provider
    for (const [ref, internal] of internalMap.entries()) {
      const provider = providerMap.get(ref);

      if (!provider) {
        // Internal record not found in provider
        lineItems.push(this._lineItem(runId, ref, 'anchor', internal.currency, internal.gross_amount, null, 'INTERNAL_ONLY'));
        discrepancies++;
      } else {
        const providerAmount = parseFloat(provider.amount || 0);
        const internalAmount = parseFloat(internal.gross_amount || 0);
        const amountMatch    = Math.abs(providerAmount - internalAmount) < 0.01;

        if (amountMatch) {
          lineItems.push(this._lineItem(runId, ref, 'anchor', internal.currency, internalAmount, providerAmount, 'MATCHED'));
          matched++;
        } else {
          lineItems.push(this._lineItem(runId, ref, 'anchor', internal.currency, internalAmount, providerAmount, 'AMOUNT_MISMATCH'));
          discrepancies++;
        }
        providerMap.delete(ref);
      }
    }

    // Records in provider but not internal
    for (const [ref, provider] of providerMap.entries()) {
      lineItems.push(this._lineItem(runId, ref, 'anchor', provider.currency, null, provider.amount, 'PROVIDER_ONLY'));
      discrepancies++;
    }

    // ── 4. Persist line items ─────────────────────────────────────────────────
    if (lineItems.length > 0) {
      await supabase
        .from('reconciliation_line_items')
        .insert(lineItems)
        .catch(e => logger.warn(`[AnchorReconciliation] Line item insert failed: ${e.message}`));
    }

    const result = {
      provider:       'anchor',
      total_checked:  internalMap.size + (providerMap.size - matched),
      matched,
      discrepancies,
      internal_only:  lineItems.filter(l => l.match_status === 'INTERNAL_ONLY').length,
      provider_only:  lineItems.filter(l => l.match_status === 'PROVIDER_ONLY').length,
      amount_mismatch: lineItems.filter(l => l.match_status === 'AMOUNT_MISMATCH').length,
    };

    logger.info(`[AnchorReconciliation] Done: matched=${matched} discrepancies=${discrepancies}`);
    return result;
  },

  _lineItem(runId, ref, provider, currency, internalAmount, providerAmount, matchStatus) {
    return {
      run_id:          runId,
      correlation_id:  null,
      provider,
      currency:        String(currency || 'NGN').toUpperCase(),
      internal_amount: internalAmount !== null ? parseFloat(internalAmount) : null,
      provider_amount: providerAmount !== null ? parseFloat(providerAmount) : null,
      match_status:    matchStatus,
      internal_ref:    ref,
      provider_ref:    ref,
      requires_action: matchStatus !== 'MATCHED',
    };
  },
};

module.exports = AnchorReconciliation;
