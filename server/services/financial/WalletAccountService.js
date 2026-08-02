'use strict';

/**
 * WalletAccountService.js
 * =======================
 * Service for per-currency wallet account projections and hold management.
 */
class WalletAccountService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    this.inMemoryProjections = new Map();
  }

  /**
   * Get or create wallet account for a user and currency
   */
  async getOrCreateAccount(userId, currency, accountType = 'PRIMARY') {
    if (!userId) throw new Error('userId is required');
    if (!currency) throw new Error('currency is required');

    const key = `${userId}_${currency.toUpperCase()}_${accountType}`;
    let account = null;

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `SELECT * FROM public.wallet_accounts 
           WHERE user_id = $1 AND currency = $2 AND account_type = $3`,
          [userId, currency.toUpperCase(), accountType]
        );
        if (res.rows && res.rows.length > 0) {
          account = res.rows[0];
          account.available_balance = parseFloat(account.available_balance || 0);
          account.reserved_balance = parseFloat(account.reserved_balance || 0);
          account.pending_balance = parseFloat(account.pending_balance || 0);
          account.locked_balance = parseFloat(account.locked_balance || 0);
        } else {
          const insertRes = await this.db.query(
            `INSERT INTO public.wallet_accounts 
             (user_id, currency, account_type, available_balance, reserved_balance, pending_balance, locked_balance, status)
             VALUES ($1, $2, $3, 0, 0, 0, 0, 'ACTIVE')
             RETURNING *`,
            [userId, currency.toUpperCase(), accountType]
          );
          if (insertRes.rows && insertRes.rows.length > 0) {
            account = insertRes.rows[0];
            account.available_balance = parseFloat(account.available_balance || 0);
          }
        }
      } catch (err) {
        // Fallback
      }
    }

    if (!account) {
      if (!this.inMemoryProjections.has(key)) {
        this.inMemoryProjections.set(key, {
          id: `wacc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          user_id: userId,
          currency: currency.toUpperCase(),
          account_type: accountType,
          available_balance: 0,
          reserved_balance: 0,
          pending_balance: 0,
          locked_balance: 0,
          status: 'ACTIVE'
        });
      }
      account = this.inMemoryProjections.get(key);
    } else {
      this.inMemoryProjections.set(account.id, account);
      this.inMemoryProjections.set(key, account);
    }

    return account;
  }

  /**
   * Update cached balance projection from a posted entry
   */
  async updateProjection(walletAccountId, amount, direction, entryType = 'DEPOSIT') {
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) return;

    if (this.db && typeof this.db.query === 'function') {
      try {
        if (direction === 'CREDIT' && entryType === 'DEPOSIT') {
          await this.db.query(
            `UPDATE public.wallet_accounts 
             SET available_balance = available_balance + $1, updated_at = NOW()
             WHERE id = $2`,
            [amount, walletAccountId]
          );
        } else if (direction === 'DEBIT' && entryType === 'WITHDRAWAL') {
          await this.db.query(
            `UPDATE public.wallet_accounts 
             SET available_balance = GREATEST(0, available_balance - $1), updated_at = NOW()
             WHERE id = $2`,
            [amount, walletAccountId]
          );
        }
      } catch (err) {
        // Fallback
      }
    }

    // In-memory update fallback
    for (const [key, account] of this.inMemoryProjections.entries()) {
      if (account.id === walletAccountId) {
        if (direction === 'CREDIT' && entryType === 'DEPOSIT') {
          account.available_balance += amount;
        } else if (direction === 'DEBIT' && entryType === 'WITHDRAWAL') {
          account.available_balance = Math.max(0, account.available_balance - amount);
        }
      }
    }
  }

  /**
   * Reserve balance for a hold (e.g. pending withdrawal)
   */
  async reserveHold(walletAccountId, amount) {
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');

    for (const [key, account] of this.inMemoryProjections.entries()) {
      if (account.id === walletAccountId) {
        if (account.available_balance < amount) {
          throw new Error('INSUFFICIENT_FUNDS: Available balance lower than hold amount');
        }
        account.available_balance -= amount;
        account.reserved_balance += amount;
        return account;
      }
    }
    return null;
  }
}

module.exports = WalletAccountService;
