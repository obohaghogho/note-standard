'use strict';

/**
 * TreasuryTransferService.js
 * ===========================
 * Service for auditable internal treasury rebalancing.
 * Delegates 100% of internal balance movements to Step 2's PostingService.
 */
class TreasuryTransferService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    const PostingService = require('../financial/PostingService');
    const TreasuryService = require('../financial/TreasuryService');

    this.treasuryService = options.treasuryService || new TreasuryService(this.db);
    this.postingService = options.postingService || new PostingService(this.db, { treasuryService: this.treasuryService });
  }

  /**
   * Execute auditable treasury rebalancing transfer
   */
  async executeTransfer(params) {
    const { sourceAccountId, targetAccountId, currency, amount, reason, approvedBy } = params;
    if (!currency) throw new Error('currency is required');
    if (!amount || amount <= 0) throw new Error('amount must be positive');
    if (!reason) throw new Error('reason is required');

    const transferId = `tt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 1. Post double-entry journal entry via Step 2 PostingService
    const postingResult = await this.postingService.postJournal({
      reference: `JNL_TREASURY_${transferId}`,
      entryType: 'TREASURY_TRANSFER',
      description: `Internal Treasury Transfer: ${reason}`,
      currency,
      lines: [
        { chartAccountId: '1110', debit: parseFloat(amount), credit: 0, currency, treasuryAccountId: sourceAccountId },
        { chartAccountId: '1150', debit: 0, credit: parseFloat(amount), currency, treasuryAccountId: targetAccountId }
      ]
    });

    const transferRecord = {
      id: transferId,
      source_account_id: sourceAccountId || null,
      target_account_id: targetAccountId || null,
      currency: currency.toUpperCase(),
      amount: parseFloat(amount),
      reason,
      status: 'COMPLETED',
      journal_id: postingResult.journal.id,
      approved_by: approvedBy || 'SYSTEM',
      completed_at: new Date(),
      created_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.treasury_transfers 
           (source_account_id, target_account_id, currency, amount, reason, status, journal_id, approved_by, completed_at)
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7, NOW())`,
          [transferRecord.source_account_id, transferRecord.target_account_id, transferRecord.currency, transferRecord.amount, transferRecord.reason, transferRecord.journal_id, transferRecord.approved_by]
        );
      } catch (err) {
        // Fallback
      }
    }

    return {
      transfer: transferRecord,
      postingResult
    };
  }
}

module.exports = TreasuryTransferService;
