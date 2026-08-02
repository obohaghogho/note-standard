'use strict';

/**
 * ReconciliationEngine.js
 * =======================
 * Step 9 Settlement & Reconciliation Engine for NoteStandard.
 * Performs daily settlement matching, Nostro account reconciliation, and break detection.
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
}

module.exports = ReconciliationEngine;
