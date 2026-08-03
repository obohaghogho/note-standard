'use strict';

/**
 * ReconciliationEngine.js
 * =======================
 * Step 9 Settlement & Reconciliation Engine for NoteStandard.
 * Performs daily settlement matching, Nostro account reconciliation, break detection,
 * and multi-currency merchant collection reconciliation.
 */
class ReconciliationEngine {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
  }

  /**
   * Run daily provider settlement reconciliation batch
   */
  async runReconciliationBatch(provider, settlementRecords = []) {
    const batchRef = `REC_${provider.toUpperCase()}_${Date.now()}`;
    let matchedCount = 0;
    let breakCount = 0;
    let totalAmount = 0;
    const breaks = [];

    for (const record of settlementRecords) {
      totalAmount += parseFloat(record.amount || 0);
      const isMatched = record.expectedAmount === record.actualAmount;
      if (isMatched) {
        matchedCount++;
      } else {
        breakCount++;
        breaks.push({
          transactionReference: record.reference,
          provider,
          expectedAmount: record.expectedAmount,
          actualAmount: record.actualAmount,
          variance: Math.abs(record.expectedAmount - record.actualAmount),
          breakType: 'AMOUNT_MISMATCH'
        });
      }
    }

    const batchSummary = {
      batchReference: batchRef,
      provider,
      totalRecords: settlementRecords.length,
      matchedRecords: matchedCount,
      unreconciledBreaks: breakCount,
      totalAmount,
      status: breakCount > 0 ? 'HAS_BREAKS' : 'COMPLETED',
      breaks
    };

    return batchSummary;
  }

  /**
   * Reconcile merchant collection deposits against bank statement records
   */
  async reconcileMerchantDeposits(provider, bankStatementRecords = [], activeReferences = []) {
    const batchRef = `REC_COLLECTION_${provider.toUpperCase()}_${Date.now()}`;
    const matched = [];
    const breaks = [];
    let totalVolume = 0;

    const refMap = new Map();
    for (const ref of activeReferences) {
      refMap.set(ref.reference.toUpperCase(), ref);
    }

    for (const statementItem of bankStatementRecords) {
      totalVolume += parseFloat(statementItem.amount || 0);
      const refCode = statementItem.reference ? statementItem.reference.toUpperCase() : null;
      const matchedRef = refCode ? refMap.get(refCode) : null;

      if (matchedRef) {
        matched.push({
          statementId: statementItem.id || statementItem.reference,
          reference: matchedRef.reference,
          amount: parseFloat(statementItem.amount),
          currency: statementItem.currency,
          userId: matchedRef.user_id,
          status: 'MATCHED'
        });
      } else {
        breaks.push({
          statementId: statementItem.id || statementItem.reference || `stmt_${Date.now()}`,
          provider,
          senderName: statementItem.senderName || 'Unknown',
          senderAccount: statementItem.senderAccount || 'Unknown',
          amount: parseFloat(statementItem.amount || 0),
          currency: statementItem.currency || 'USD',
          breakType: 'UNMATCHED_DEPOSIT',
          reason: 'No matching deposit reference found in registry'
        });
      }
    }

    return {
      batchReference: batchRef,
      provider: provider.toUpperCase(),
      totalRecords: bankStatementRecords.length,
      matchedCount: matched.length,
      breakCount: breaks.length,
      totalVolume,
      matched,
      breaks,
      status: breaks.length > 0 ? 'HAS_UNMATCHED_DEPOSITS' : 'RECONCILED'
    };
  }
}

module.exports = ReconciliationEngine;
