'use strict';

/**
 * CryptoLedgerService
 * ==================
 * Core sovereign internal ledger engine for NoteStandard.
 * 
 * Concurrency Model:
 * Implements a Hybrid Concurrency Control Architecture:
 * 1. Primary Concurrency: PostgreSQL row locking (`SELECT ... FOR UPDATE`) serializes writers on the wallet row.
 * 2. Secondary Integrity: Optimistic version assertion (`WHERE version = expectedVersion`) provides defense-in-depth against stale writes or un-locked update paths.
 * 
 * Enforces double-entry bookkeeping, idempotency key protection, and non-negative balance constraints.
 */

const pool = require('../config/pgPool');
const supabase = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
const logger = require('../utils/logger');

class CryptoLedgerService {
  /**
   * Fetch or auto-provision user crypto wallets
   */
  async getWallets(userId) {
    if (!userId) throw new Error("USER_ID_REQUIRED");

    const currencies = ['BTC', 'ETH', 'USDT', 'USDC'];
    
    // Auto-create missing wallets for user
    for (const curr of currencies) {
      await this.getOrCreateWallet(userId, curr);
    }

    const res = await pool.query(
      `SELECT id, user_id, currency, available_balance, locked_balance, pending_balance, total_balance, status, version, created_at, updated_at
       FROM public.crypto_wallets
       WHERE user_id = $1 AND currency = ANY($2)
       ORDER BY currency ASC`,
      [userId, currencies]
    );

    return res.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      currency: row.currency,
      available_balance: new Decimal(row.available_balance).toString(),
      locked_balance: new Decimal(row.locked_balance).toString(),
      pending_balance: new Decimal(row.pending_balance).toString(),
      total_balance: new Decimal(row.total_balance).toString(),
      status: row.status,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  /**
   * Get or create specific user crypto wallet
   */
  async getOrCreateWallet(userId, currency, client = pool) {
    const upCurrency = String(currency).toUpperCase();
    
    const existing = await client.query(
      `SELECT * FROM public.crypto_wallets WHERE user_id = $1 AND currency = $2`,
      [userId, upCurrency]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    try {
      const created = await client.query(
        `INSERT INTO public.crypto_wallets (user_id, currency, available_balance, locked_balance, pending_balance, status, version)
         VALUES ($1, $2, 0, 0, 0, 'ACTIVE', 1)
         ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [userId, upCurrency]
      );
      return created.rows[0];
    } catch (err) {
      const retry = await client.query(
        `SELECT * FROM public.crypto_wallets WHERE user_id = $1 AND currency = $2`,
        [userId, upCurrency]
      );
      if (retry.rows.length > 0) return retry.rows[0];
      throw err;
    }
  }

  /**
   * Helper to fetch account ID from Chart of Accounts by account_code
   */
  async getAccountIdByCode(accountCode, client = pool) {
    const res = await client.query(
      `SELECT id FROM public.crypto_accounts WHERE account_code = $1 LIMIT 1`,
      [accountCode]
    );
    if (res.rows.length === 0) {
      throw new Error(`CHART_OF_ACCOUNTS_NOT_FOUND: ${accountCode}`);
    }
    return res.rows[0].id;
  }

  /**
   * Post double-entry journal lines for a transaction
   */
  async postDoubleEntry(client, { transactionId, debitAccountCode, creditAccountCode, currency, amount }) {
    const decAmount = new Decimal(amount);
    if (decAmount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Ledger entries require positive amount.");
    }

    const debitAccountId = await this.getAccountIdByCode(debitAccountCode, client);
    const creditAccountId = await this.getAccountIdByCode(creditAccountCode, client);

    const res = await client.query(
      `INSERT INTO public.crypto_ledger_entries (transaction_id, debit_account_id, credit_account_id, currency, amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [transactionId, debitAccountId, creditAccountId, currency.toUpperCase(), decAmount.toString()]
    );

    logger.info(`[CryptoLedgerService] Double-entry posted. Tx: ${transactionId}, Debit: ${debitAccountCode}, Credit: ${creditAccountCode}, Amt: ${decAmount.toString()} ${currency}`);
    return res.rows[0];
  }

  /**
   * Transactional Outbox Staging
   * Inserts an outbox event record inside the current database transaction block.
   */
  async stageOutboxEvent(client, { eventName, aggregateType, aggregateId, payload }) {
    await client.query(
      `INSERT INTO public.crypto_outbox_events (event_name, aggregate_type, aggregate_id, payload, status)
       VALUES ($1, $2, $3, $4, 'PENDING')`,
      [eventName, aggregateType, aggregateId, JSON.stringify(payload)]
    );
    logger.info(`[CryptoLedgerService] Outbox event staged atomically: ${eventName} (Ref: ${aggregateId})`);
  }

  /**
   * Credit Internal Ledger (e.g. Deposit Confirmation)
   * Idempotent & Double-Entry compliant
   */
  async creditDeposit({ userId, currency, amount, txHash, idempotencyKey, metadata = {} }) {
    const client = await pool.connect();
    const upCurrency = String(currency).toUpperCase();
    const decAmount = new Decimal(amount);

    try {
      await client.query('BEGIN');

      // Idempotency check
      if (idempotencyKey) {
        const existingTx = await client.query(
          `SELECT * FROM public.crypto_transactions WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existingTx.rows.length > 0) {
          await client.query('COMMIT');
          logger.info(`[CryptoLedgerService] Idempotency key hit for creditDeposit: ${idempotencyKey}`);
          return { success: true, transaction: existingTx.rows[0], idempotent: true };
        }
      }

      // Fetch user wallet
      const wallet = await this.getOrCreateWallet(userId, upCurrency, client);

      // Lock row for optimistic concurrency update
      const lockRes = await client.query(
        `SELECT id, available_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [wallet.id]
      );
      const currentWallet = lockRes.rows[0];
      const newAvail = new Decimal(currentWallet.available_balance).add(decAmount);
      const expectedVersion = currentWallet.version;

      // Optimistic concurrency update
      const updateRes = await client.query(
        `UPDATE public.crypto_wallets 
         SET available_balance = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3
         RETURNING *`,
        [newAvail.toString(), wallet.id, expectedVersion]
      );

      if (updateRes.rows.length === 0) {
        throw new Error("OPTIMISTIC_LOCK_COLLISION: Wallet updated concurrently by another node.");
      }

      // Insert transaction record
      const txRes = await client.query(
        `INSERT INTO public.crypto_transactions
         (wallet_id, user_id, idempotency_key, type, currency, amount, fee, network, tx_hash, status, metadata)
         VALUES ($1, $2, $3, 'DEPOSIT', $4, $5, 0, $6, $7, 'COMPLETED', $8)
         RETURNING *`,
        [
          wallet.id,
          userId,
          idempotencyKey || `dep_${uuidv4()}`,
          upCurrency,
          decAmount.toString(),
          metadata.network || 'NATIVE',
          txHash || null,
          JSON.stringify(metadata)
        ]
      );
      const transaction = txRes.rows[0];

      // Double-Entry Bookkeeping:
      // Debit Asset: 1000-NOWPAYMENTS-{CURRENCY}
      // Credit Liability: 2000-USER-LIABILITIES
      const debitAccount = `1000-NOWPAYMENTS-${upCurrency}`;
      const creditAccount = '2000-USER-LIABILITIES';
      await this.postDoubleEntry(client, {
        transactionId: transaction.id,
        debitAccountCode: debitAccount,
        creditAccountCode: creditAccount,
        currency: upCurrency,
        amount: decAmount.toString()
      });

      // Stage Transactional Outbox Event
      await this.stageOutboxEvent(client, {
        eventName: 'crypto.deposit.credited',
        aggregateType: 'crypto_transactions',
        aggregateId: transaction.id,
        payload: { userId, amount: decAmount.toString(), currency: upCurrency, txHash }
      });

      await client.query('COMMIT');
      return { success: true, transaction, updatedWallet: updateRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      
      // Catch race-condition UNIQUE constraint violations (code 23505)
      if (err.code === '23505' && idempotencyKey) {
        logger.info(`[CryptoLedgerService] Race condition caught via 23505 unique_violation for idempotencyKey: ${idempotencyKey}`);
        const existingTx = await pool.query(
          `SELECT * FROM public.crypto_transactions WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existingTx.rows.length > 0) {
          return { success: true, transaction: existingTx.rows[0], idempotent: true };
        }
      }

      logger.error(`[CryptoLedgerService] Error crediting deposit: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lock Funds for Withdrawal / Order
   */
  async lockFunds({ userId, currency, amount, fee = 0, idempotencyKey, metadata = {} }) {
    const client = await pool.connect();
    const upCurrency = String(currency).toUpperCase();
    const decAmount = new Decimal(amount);
    const decFee = new Decimal(fee);
    const totalRequired = decAmount.add(decFee);

    try {
      await client.query('BEGIN');

      // Idempotency check
      if (idempotencyKey) {
        const existingTx = await client.query(
          `SELECT * FROM public.crypto_transactions WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existingTx.rows.length > 0) {
          await client.query('COMMIT');
          return { success: true, transaction: existingTx.rows[0], idempotent: true };
        }
      }

      const wallet = await this.getOrCreateWallet(userId, upCurrency, client);

      const lockRes = await client.query(
        `SELECT id, available_balance, locked_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [wallet.id]
      );
      const current = lockRes.rows[0];

      const currentAvail = new Decimal(current.available_balance);
      const currentLocked = new Decimal(current.locked_balance);

      if (currentAvail.lt(totalRequired)) {
        throw new Error(`INSUFFICIENT_FUNDS: Available ${currentAvail.toString()} ${upCurrency} < required ${totalRequired.toString()} ${upCurrency}`);
      }

      const newAvail = currentAvail.sub(totalRequired);
      const newLocked = currentLocked.add(totalRequired);

      const updateRes = await client.query(
        `UPDATE public.crypto_wallets 
         SET available_balance = $1, locked_balance = $2, version = version + 1, updated_at = NOW()
         WHERE id = $3 AND version = $4
         RETURNING *`,
        [newAvail.toString(), newLocked.toString(), wallet.id, current.version]
      );

      if (updateRes.rows.length === 0) {
        throw new Error("OPTIMISTIC_LOCK_COLLISION: Wallet updated concurrently.");
      }

      const txRes = await client.query(
        `INSERT INTO public.crypto_transactions
         (wallet_id, user_id, idempotency_key, type, currency, amount, fee, network, status, metadata)
         VALUES ($1, $2, $3, 'WITHDRAWAL', $4, $5, $6, $7, 'PENDING', $8)
         RETURNING *`,
        [
          wallet.id,
          userId,
          idempotencyKey || `wd_${uuidv4()}`,
          upCurrency,
          decAmount.toString(),
          decFee.toString(),
          metadata.network || 'NATIVE',
          JSON.stringify(metadata)
        ]
      );

      // Double-Entry Bookkeeping:
      // Debit Liability: 2000-USER-LIABILITIES
      // Credit Liability: 2001-PENDING-WITHDRAW
      await this.postDoubleEntry(client, {
        transactionId: txRes.rows[0].id,
        debitAccountCode: '2000-USER-LIABILITIES',
        creditAccountCode: '2001-PENDING-WITHDRAW',
        currency: upCurrency,
        amount: totalRequired.toString()
      });

      await client.query('COMMIT');
      return { success: true, transaction: txRes.rows[0], wallet: updateRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Finalize Payout (Deduct Locked Funds)
   */
  async finalizePayout({ transactionId, providerId = 'NOWPAYMENTS', txHash = null }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const txRes = await client.query(
        `SELECT * FROM public.crypto_transactions WHERE id = $1 FOR UPDATE`,
        [transactionId]
      );
      if (txRes.rows.length === 0) throw new Error("TRANSACTION_NOT_FOUND");
      const tx = txRes.rows[0];

      if (tx.status === 'COMPLETED') {
        await client.query('COMMIT');
        return { success: true, transaction: tx, idempotent: true };
      }

      const totalDeduct = new Decimal(tx.amount).add(new Decimal(tx.fee));

      const walletRes = await client.query(
        `SELECT id, locked_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [tx.wallet_id]
      );
      const wallet = walletRes.rows[0];
      const newLocked = new Decimal(wallet.locked_balance).sub(totalDeduct);

      const updateWallet = await client.query(
        `UPDATE public.crypto_wallets
         SET locked_balance = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3
         RETURNING *`,
        [newLocked.toString(), wallet.id, wallet.version]
      );

      const updatedTx = await client.query(
        `UPDATE public.crypto_transactions
         SET status = 'COMPLETED', tx_hash = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [txHash || null, tx.id]
      );

      // Double-Entry Bookkeeping:
      // Debit Liability: 2001-PENDING-WITHDRAW
      // Credit Asset: 1000-NOWPAYMENTS-{CURRENCY}
      const assetAccountCode = providerId === 'FINCRA' ? '1010-FINCRA-USD' : (providerId === 'ANCHOR' ? '1020-ANCHOR-USD' : `1000-NOWPAYMENTS-${tx.currency}`);
      await this.postDoubleEntry(client, {
        transactionId: tx.id,
        debitAccountCode: '2001-PENDING-WITHDRAW',
        creditAccountCode: assetAccountCode,
        currency: tx.currency,
        amount: totalDeduct.toString()
      });

      await client.query('COMMIT');
      return { success: true, transaction: updatedTx.rows[0], wallet: updateWallet.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Instant Internal Transfer (User A -> User B)
   * Zero Blockchain Movement
   */
  async internalTransfer({ senderId, recipientId, currency, amount, fee = 0, idempotencyKey }) {
    if (senderId === recipientId) throw new Error("CANNOT_TRANSFER_TO_SELF");
    const client = await pool.connect();
    const upCurrency = String(currency).toUpperCase();
    const decAmount = new Decimal(amount);
    const decFee = new Decimal(fee);
    const netAmount = decAmount.sub(decFee);

    if (netAmount.lte(0)) throw new Error("AMOUNT_TOO_SMALL_AFTER_FEES");

    try {
      await client.query('BEGIN');

      if (idempotencyKey) {
        const existingTx = await client.query(
          `SELECT * FROM public.crypto_transactions WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existingTx.rows.length > 0) {
          await client.query('COMMIT');
          return { success: true, transaction: existingTx.rows[0], idempotent: true };
        }
      }

      const senderWallet = await this.getOrCreateWallet(senderId, upCurrency, client);
      const recipientWallet = await this.getOrCreateWallet(recipientId, upCurrency, client);

      const senderLock = await client.query(
        `SELECT id, available_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [senderWallet.id]
      );
      const sWallet = senderLock.rows[0];

      if (new Decimal(sWallet.available_balance).lt(decAmount)) {
        throw new Error(`INSUFFICIENT_FUNDS: Sender available balance is less than transfer amount.`);
      }

      // 1. Debit Sender
      const newSenderAvail = new Decimal(sWallet.available_balance).sub(decAmount);
      await client.query(
        `UPDATE public.crypto_wallets 
         SET available_balance = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3`,
        [newSenderAvail.toString(), senderWallet.id, sWallet.version]
      );

      // 2. Credit Recipient
      const recipLock = await client.query(
        `SELECT id, available_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [recipientWallet.id]
      );
      const rWallet = recipLock.rows[0];
      const newRecipAvail = new Decimal(rWallet.available_balance).add(netAmount);
      await client.query(
        `UPDATE public.crypto_wallets 
         SET available_balance = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3`,
        [newRecipAvail.toString(), recipientWallet.id, rWallet.version]
      );

      // 3. Insert Transaction Record
      const txRes = await client.query(
        `INSERT INTO public.crypto_transactions
         (wallet_id, user_id, idempotency_key, type, currency, amount, fee, status, metadata)
         VALUES ($1, $2, $3, 'TRANSFER', $4, $5, $6, 'COMPLETED', $7)
         RETURNING *`,
        [
          senderWallet.id,
          senderId,
          idempotencyKey || `tx_${uuidv4()}`,
          upCurrency,
          decAmount.toString(),
          decFee.toString(),
          JSON.stringify({ recipient_id: recipientId, net_amount: netAmount.toString() })
        ]
      );

      // 4. Double-Entry Bookkeeping (Internal Transfer moves liabilities from User A to User B):
      // Debit Liability: 2000-USER-LIABILITIES (Sender)
      // Credit Liability: 2000-USER-LIABILITIES (Recipient)
      await this.postDoubleEntry(client, {
        transactionId: txRes.rows[0].id,
        debitAccountCode: '2000-USER-LIABILITIES',
        creditAccountCode: '2000-USER-LIABILITIES',
        currency: upCurrency,
        amount: netAmount.toString()
      });

      if (decFee.gt(0)) {
        await this.postDoubleEntry(client, {
          transactionId: txRes.rows[0].id,
          debitAccountCode: '2000-USER-LIABILITIES',
          creditAccountCode: '4000-PLATFORM-FEES',
          currency: upCurrency,
          amount: decFee.toString()
        });
      }

      await client.query('COMMIT');
      logger.info(`[CryptoLedgerService] Internal transfer completed: User ${senderId} -> User ${recipientId}, ${decAmount.toString()} ${upCurrency}`);
      return { success: true, transaction: txRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic Crypto Swap (e.g., BTC -> USDT)
   */
  async executeSwap({ userId, fromCurrency, toCurrency, fromAmount, toAmount, fee = 0, idempotencyKey }) {
    const client = await pool.connect();
    const upFrom = String(fromCurrency).toUpperCase();
    const upTo = String(toCurrency).toUpperCase();
    const decFrom = new Decimal(fromAmount);
    const decTo = new Decimal(toAmount);
    const decFee = new Decimal(fee);

    try {
      await client.query('BEGIN');

      if (idempotencyKey) {
        const existingTx = await client.query(
          `SELECT * FROM public.crypto_transactions WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existingTx.rows.length > 0) {
          await client.query('COMMIT');
          return { success: true, transaction: existingTx.rows[0], idempotent: true };
        }
      }

      const fromWallet = await this.getOrCreateWallet(userId, upFrom, client);
      const toWallet = await this.getOrCreateWallet(userId, upTo, client);

      // Debit From Currency
      const fromLock = await client.query(
        `SELECT id, available_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [fromWallet.id]
      );
      const fWallet = fromLock.rows[0];
      if (new Decimal(fWallet.available_balance).lt(decFrom)) {
        throw new Error(`INSUFFICIENT_FUNDS: Available ${upFrom} balance is less than swap amount.`);
      }

      const newFromAvail = new Decimal(fWallet.available_balance).sub(decFrom);
      await client.query(
        `UPDATE public.crypto_wallets
         SET available_balance = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3`,
        [newFromAvail.toString(), fromWallet.id, fWallet.version]
      );

      // Credit To Currency
      const toLock = await client.query(
        `SELECT id, available_balance, version FROM public.crypto_wallets WHERE id = $1 FOR UPDATE`,
        [toWallet.id]
      );
      const tWallet = toLock.rows[0];
      const newToAvail = new Decimal(tWallet.available_balance).add(decTo.sub(decFee));
      await client.query(
        `UPDATE public.crypto_wallets
         SET available_balance = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3`,
        [newToAvail.toString(), toWallet.id, tWallet.version]
      );

      // Record Swap Transaction
      const txRes = await client.query(
        `INSERT INTO public.crypto_transactions
         (wallet_id, user_id, idempotency_key, type, currency, amount, fee, status, metadata)
         VALUES ($1, $2, $3, 'SWAP', $4, $5, $6, 'COMPLETED', $7)
         RETURNING *`,
        [
          fromWallet.id,
          userId,
          idempotencyKey || `swap_${uuidv4()}`,
          upFrom,
          decFrom.toString(),
          decFee.toString(),
          JSON.stringify({ target_currency: upTo, target_amount: decTo.toString() })
        ]
      );

      // Double-entry ledger for swap
      await this.postDoubleEntry(client, {
        transactionId: txRes.rows[0].id,
        debitAccountCode: '2000-USER-LIABILITIES',
        creditAccountCode: '2000-USER-LIABILITIES',
        currency: upFrom,
        amount: decFrom.toString()
      });

      await client.query('COMMIT');
      logger.info(`[CryptoLedgerService] Swap executed: ${decFrom.toString()} ${upFrom} -> ${decTo.toString()} ${upTo} for User ${userId}`);
      return { success: true, transaction: txRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Full Ledger Replay Reconstruction
   * Rebuilds wallet balance from immutable double-entry journal entries
   * and verifies zero-drift against materialized crypto_wallets row.
   */
  async reconstructWalletFromLedger(userId, currency) {
    const upCurr = String(currency).toUpperCase();
    
    // Fetch materialized wallet balance
    const walletRes = await pool.query(
      `SELECT available_balance, locked_balance, total_balance FROM public.crypto_wallets WHERE user_id = $1 AND currency = $2`,
      [userId, upCurr]
    );

    if (walletRes.rows.length === 0) {
      throw new Error(`WALLET_NOT_FOUND: ${userId} / ${upCurr}`);
    }

    const materializedWallet = walletRes.rows[0];

    // Query immutable ledger entries for user liability account
    const liabilityAccountRes = await pool.query(
      `SELECT id FROM public.crypto_accounts WHERE account_code = '2000-USER-LIABILITIES' LIMIT 1`
    );

    if (liabilityAccountRes.rows.length === 0) {
      throw new Error("USER_LIABILITIES_ACCOUNT_NOT_FOUND");
    }

    const liabilityAccountId = liabilityAccountRes.rows[0].id;

    // Credits increase user liability (user deposits), Debits decrease user liability (withdrawals/transfers out)
    const ledgerReconciliationRes = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN credit_account_id = $1 THEN e.amount ELSE 0 END), 0) as total_credits,
         COALESCE(SUM(CASE WHEN debit_account_id = $1 THEN e.amount ELSE 0 END), 0) as total_debits
       FROM public.crypto_ledger_entries e
       JOIN public.crypto_transactions t ON e.transaction_id = t.id
       WHERE t.user_id = $2 AND e.currency = $3`,
      [liabilityAccountId, userId, upCurr]
    );

    const { total_credits, total_debits } = ledgerReconciliationRes.rows[0];
    const reconstructedLiability = new Decimal(total_credits).sub(new Decimal(total_debits));
    const materializedTotal = new Decimal(materializedWallet.total_balance);

    const drift = materializedTotal.sub(reconstructedLiability).abs();
    const isMatched = drift.lt(1e-8);

    return {
      userId,
      currency: upCurr,
      reconstructedBalance: reconstructedLiability.toString(),
      materializedBalance: materializedTotal.toString(),
      drift: drift.toString(),
      isMatched
    };
  }
}

module.exports = new CryptoLedgerService();
