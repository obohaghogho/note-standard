'use strict';

/**
 * TreasuryService.js
 * ==================
 * Service for internal treasury account tracking & liquidity monitoring.
 */
class TreasuryService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    this.inMemoryTreasury = new Map();
  }

  /**
   * Get or create internal treasury account for currency & category
   */
  async getOrCreateAccount(currency, category = 'AVAILABLE') {
    if (!currency) throw new Error('currency is required');
    const key = `${currency.toUpperCase()}_${category}`;

    let account = null;

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `SELECT * FROM public.treasury_accounts WHERE currency = $1 AND account_category = $2`,
          [currency.toUpperCase(), category]
        );
        if (res.rows && res.rows.length > 0) {
          account = res.rows[0];
          account.balance = parseFloat(account.balance || 0);
        }
      } catch (err) {
        // Fallback
      }
    }

    if (!account) {
      if (!this.inMemoryTreasury.has(key)) {
        this.inMemoryTreasury.set(key, {
          id: `tracc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          currency: currency.toUpperCase(),
          account_category: category,
          balance: 0
        });
      }
      account = this.inMemoryTreasury.get(key);
    } else {
      this.inMemoryTreasury.set(account.id, account);
      this.inMemoryTreasury.set(key, account);
    }

    return account;
  }

  /**
   * Update treasury account balance projection
   */
  async updateProjection(treasuryAccountId, amount, direction) {
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) return;

    if (this.db && typeof this.db.query === 'function') {
      try {
        if (direction === 'DEBIT') {
          await this.db.query(
            `UPDATE public.treasury_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
            [amount, treasuryAccountId]
          );
        } else if (direction === 'CREDIT') {
          await this.db.query(
            `UPDATE public.treasury_accounts SET balance = GREATEST(0, balance - $1), updated_at = NOW() WHERE id = $2`,
            [amount, treasuryAccountId]
          );
        }
      } catch (err) {
        // Fallback
      }
    }

    for (const [key, account] of this.inMemoryTreasury.entries()) {
      if (account.id === treasuryAccountId) {
        if (direction === 'DEBIT') {
          account.balance += amount;
        } else if (direction === 'CREDIT') {
          account.balance = Math.max(0, account.balance - amount);
        }
      }
    }
  }
}

module.exports = TreasuryService;
