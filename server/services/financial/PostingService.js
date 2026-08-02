'use strict';

/**
 * PostingService.js
 * =================
 * Central financial posting pipeline for NoteStandard Enterprise Banking.
 * Flow: Journal (DRAFT -> POSTED) -> Ledger Entries -> Wallet Balance Projection -> Treasury Balance Projection.
 */
class PostingService {
  constructor(db, options = {}) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    const JournalService = require('./JournalService');
    const LedgerService = require('./LedgerService');
    const WalletAccountService = require('./WalletAccountService');
    const TreasuryService = require('./TreasuryService');

    this.journalService = options.journalService || new JournalService(this.db);
    this.ledgerService = options.ledgerService || new LedgerService(this.db);
    this.walletAccountService = options.walletAccountService || new WalletAccountService(this.db);
    this.treasuryService = options.treasuryService || new TreasuryService(this.db);
  }

  /**
   * Execute atomic posting of a Journal entry
   * @param {Object} journalData { reference, entryType, description, lines, walletAccountId, treasuryAccountId, transactionId, paymentIntentId }
   */
  async postJournal(journalData) {
    // 1. Create & validate balanced journal
    const journal = await this.journalService.createJournal(journalData);
    journal.status = 'POSTED';
    journal.posted_at = new Date();

    const postedLedgerEntries = [];

    // 2. Post ledger entries for each journal line
    for (const line of journal.lines) {
      const direction = line.debit > 0 ? 'DEBIT' : 'CREDIT';
      const amount = line.debit > 0 ? line.debit : line.credit;
      const chartCode = String(line.chart_account_id);
      const targetTreasuryId = line.treasuryAccountId || line.treasury_account_id || journalData.treasuryAccountId;
      const targetWalletId = line.walletAccountId || line.wallet_account_id || journalData.walletAccountId;

      const ledgerEntry = await this.ledgerService.postEntry({
        journalLineId: line.id,
        walletAccountId: chartCode.startsWith('2') ? (targetWalletId || null) : null,
        treasuryAccountId: chartCode.startsWith('1') ? (targetTreasuryId || null) : null,
        transactionId: journalData.transactionId || null,
        paymentIntentId: journalData.paymentIntentId || null,
        providerReference: journalData.providerReference || null,
        currency: line.currency,
        amount,
        direction
      });

      postedLedgerEntries.push(ledgerEntry);

      // 3. Target Balance Projection based on Chart Account Code (1xxx = Treasury Assets, 2xxx = Customer Liabilities)
      if (chartCode.startsWith('2') && targetWalletId) {
        await this.walletAccountService.updateProjection(
          targetWalletId,
          amount,
          direction,
          journalData.entryType
        );
      }

      if (chartCode.startsWith('1') && targetTreasuryId) {
        await this.treasuryService.updateProjection(
          targetTreasuryId,
          amount,
          direction
        );
      }
    }

    return {
      journal,
      ledgerEntries: postedLedgerEntries
    };
  }
}

module.exports = PostingService;
