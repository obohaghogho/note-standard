'use strict';

/**
 * AccountingPeriodService.js
 * ===========================
 * Service for enforcing monthly accounting period controls (OPEN, CLOSED, LOCKED, ARCHIVED).
 */
class AccountingPeriodService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
  }

  /**
   * Get active accounting period or validate given period
   */
  async getActivePeriod(date = new Date()) {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          'SELECT * FROM public.accounting_periods WHERE month = $1 AND year = $2',
          [month, year]
        );
        if (res.rows && res.rows.length > 0) {
          return res.rows[0];
        }
      } catch (err) {
        // Fallback to memory active period
      }
    }

    return {
      id: `period-${year}-${month}`,
      month,
      year,
      status: 'OPEN'
    };
  }

  /**
   * Verify if a posting period is open for financial entries
   */
  async assertPeriodOpen(periodId) {
    let period = null;

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          'SELECT * FROM public.accounting_periods WHERE id = $1',
          [periodId]
        );
        if (res.rows && res.rows.length > 0) {
          period = res.rows[0];
        }
      } catch (err) {
        // Fallback to memory mock if unmigrated
      }
    }

    if (!period) {
      period = await this.getActivePeriod();
    }

    if (period.status !== 'OPEN') {
      throw new Error(`ACCOUNTING_PERIOD_CLOSED: Cannot post entries into period in '${period.status}' state.`);
    }

    return true;
  }
}

module.exports = AccountingPeriodService;
