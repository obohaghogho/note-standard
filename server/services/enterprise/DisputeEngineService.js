'use strict';

/**
 * DisputeEngineService.js
 * =======================
 * Step 13 Customer Disputes & Chargeback Engine for NoteStandard.
 * Handles dispute logging, evidence submission, arbitration, and reversal journal posting via PostingService.
 */
class DisputeEngineService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
    const PostingService = require('../financial/PostingService');
    const WalletAccountService = require('../financial/WalletAccountService');
    const TreasuryService = require('../financial/TreasuryService');

    this.walletService = options.walletService || new WalletAccountService(this.db);
    this.treasuryService = options.treasuryService || new TreasuryService(this.db);
    this.postingService = options.postingService || new PostingService(this.db, { walletAccountService: this.walletService, treasuryService: this.treasuryService });
  }

  /**
   * File a customer dispute
   */
  async createDispute(params) {
    const { transactionId, userId, amount, currency, reason = 'UNAUTHORIZED_CHARGE' } = params;
    const ref = `DISP_${Date.now()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const disputeRecord = {
      id: `disp_${Date.now()}`,
      dispute_reference: ref,
      transaction_id: transactionId,
      user_id: userId,
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      reason,
      status: 'OPEN',
      created_at: new Date()
    };

    return disputeRecord;
  }

  /**
   * Resolve dispute and execute automatic reversal journal posting
   */
  async resolveDispute(disputeRecord, outcome = 'WON') {
    if (outcome === 'WON') {
      disputeRecord.status = 'WON';
      return disputeRecord;
    }

    // Reversal journal for lost dispute / chargeback refund
    const userWallet = await this.walletService.getOrCreateAccount(disputeRecord.user_id, disputeRecord.currency, 'PRIMARY');
    const treasury = await this.treasuryService.getOrCreateAccount(disputeRecord.currency, 'AVAILABLE');

    const posting = await this.postingService.postJournal({
      reference: `JNL_REVERSAL_${disputeRecord.dispute_reference}`,
      entryType: 'DISPUTE_REVERSAL',
      description: `Chargeback Reversal for Dispute ${disputeRecord.dispute_reference}`,
      walletAccountId: userWallet.id,
      treasuryAccountId: treasury.id,
      lines: [
        { chartAccountId: '2110', debit: disputeRecord.amount, credit: 0, currency: disputeRecord.currency },
        { chartAccountId: '1110', debit: 0, credit: disputeRecord.amount, currency: disputeRecord.currency }
      ]
    });

    disputeRecord.status = 'REVERSED';
    disputeRecord.reversal_journal_id = posting.journal.id;
    return disputeRecord;
  }
}

module.exports = DisputeEngineService;
