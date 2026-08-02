'use strict';

/**
 * JournalService.js
 * =================
 * Service for creating and balancing financial Journal entries & lines.
 * Enforces the invariant: SUM(debit) == SUM(credit).
 */
class JournalService {
  constructor(db, periodService) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    const AccountingPeriodService = require('./AccountingPeriodService');
    this.periodService = periodService || new AccountingPeriodService(this.db);
  }

  /**
   * Create a balanced Journal entry with atomic lines
   * @param {Object} journalData { reference, entryType, description, periodId, lines }
   * lines: Array of { chartAccountId, debit, credit, currency, memo, referenceType, referenceId, treasuryAccountId, walletAccountId }
   */
  async createJournal(journalData) {
    const { reference, entryType, description, periodId, lines } = journalData;

    if (!reference) throw new Error('Journal reference is required');
    if (!entryType) throw new Error('Journal entryType is required');
    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      throw new Error('Journal must contain at least 2 balanced lines');
    }

    // 1. Calculate & verify debit == credit invariant
    let totalDebit = 0;
    let totalCredit = 0;

    lines.forEach((line, idx) => {
      const d = parseFloat(line.debit || 0);
      const c = parseFloat(line.credit || 0);
      if (d < 0 || c < 0) throw new Error(`Line ${idx + 1}: Negative amounts forbidden`);
      if (d > 0 && c > 0) throw new Error(`Line ${idx + 1}: Line cannot specify both debit and credit`);
      totalDebit += d;
      totalCredit += c;
    });

    // Precision check to 8 decimal places
    if (Math.abs(totalDebit - totalCredit) > 0.00000001) {
      throw new Error(`UNBALANCED_JOURNAL: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit})`);
    }

    // 2. Validate Accounting Period
    const activePeriod = periodId 
      ? { id: periodId, status: 'OPEN' }
      : await this.periodService.getActivePeriod();
      
    await this.periodService.assertPeriodOpen(activePeriod.id);

    const journalRecord = {
      id: `jnl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      accounting_period_id: activePeriod.id,
      reference,
      entry_type: entryType,
      description,
      status: 'DRAFT',
      lines: lines.map((l, i) => ({
        id: `line_${Date.now()}_${i + 1}`,
        line_number: i + 1,
        chart_account_id: l.chartAccountId || l.chart_account_id,
        debit: parseFloat(l.debit || 0),
        credit: parseFloat(l.credit || 0),
        currency: l.currency,
        memo: l.memo,
        reference_type: l.referenceType || l.reference_type,
        reference_id: l.referenceId || l.reference_id,
        treasuryAccountId: l.treasuryAccountId || l.treasury_account_id,
        walletAccountId: l.walletAccountId || l.wallet_account_id
      }))
    };

    return journalRecord;
  }
}

module.exports = JournalService;
