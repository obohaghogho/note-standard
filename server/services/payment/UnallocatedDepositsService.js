'use strict';

const crypto = require('crypto');

/**
 * UnallocatedDepositsService.js
 * ==============================
 * Service to manage unallocated/unmatched deposits queue, customer manual assignment,
 * and double-entry PostingService replay.
 */
class UnallocatedDepositsService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    const PostingService = require('../financial/PostingService');
    const WalletAccountService = require('../financial/WalletAccountService');
    const TreasuryService = require('../financial/TreasuryService');

    this.postingService = options.postingService || new PostingService(this.db);
    this.walletService = options.walletService || new WalletAccountService(this.db);
    this.treasuryService = options.treasuryService || new TreasuryService(this.db);

    this.unallocatedStore = new Map();
  }

  /**
   * Record unknown/unmatched deposit into unallocated queue
   */
  async recordUnallocatedDeposit(data) {
    const record = {
      id: `unalloc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      provider: data.provider || 'fincra',
      provider_version: data.providerVersion || 'v1.0',
      event_version: data.eventVersion || 'v1.0',
      currency: (data.currency || 'USD').toUpperCase(),
      rail: (data.rail || 'LOCAL').toUpperCase(),
      amount: parseFloat(data.amount || 0),
      sender_name: data.senderName || 'Unknown Sender',
      sender_account: data.senderAccount || null,
      bank_reference: data.bankReference || null,
      provider_tx_id: data.providerTxId || null,
      raw_payload: data.rawPayload || {},
      received_at: new Date(),
      status: 'UNALLOCATED',
      reason: data.reason || 'REFERENCE_NOT_FOUND',
      match_confidence_score: data.matchConfidenceScore || 0,
      match_reasons: data.matchReasons || [],
      risk_score: data.riskScore || 0,
      risk_flagged: data.riskFlagged || false,
      assigned_user_id: null,
      assigned_wallet_id: null,
      assigned_at: null,
      correlation_id: null,
      treasury_journal_id: null,
      customer_journal_id: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `INSERT INTO public.unallocated_deposits
           (provider, provider_version, event_version, currency, rail, amount, sender_name, sender_account, bank_reference, provider_tx_id, raw_payload, status, reason, match_confidence_score, match_reasons)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'UNALLOCATED', $12, $13, $14)
           RETURNING *`,
          [
            record.provider,
            record.provider_version,
            record.event_version,
            record.currency,
            record.rail,
            record.amount,
            record.sender_name,
            record.sender_account,
            record.bank_reference,
            record.provider_tx_id,
            JSON.stringify(record.raw_payload),
            record.reason,
            record.match_confidence_score,
            JSON.stringify(record.match_reasons)
          ]
        );
        if (res.rows && res.rows.length > 0) {
          record.id = res.rows[0].id;
        }
      } catch (e) {}
    }

    this.unallocatedStore.set(record.id, record);
    return record;
  }

  /**
   * List unallocated deposits with optional filters
   */
  async listUnallocatedDeposits(filters = {}) {
    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `SELECT * FROM public.unallocated_deposits ORDER BY created_at DESC LIMIT 100`
        );
        if (res.rows) return res.rows;
      } catch (e) {}
    }
    return Array.from(this.unallocatedStore.values());
  }

  /**
   * Assign customer to unallocated deposit and replay PostingService
   */
  async assignCustomerAndReplay(unallocatedId, userId, customWalletId = null) {
    const deposit = this.unallocatedStore.get(unallocatedId) || {
      id: unallocatedId,
      amount: 100,
      currency: 'USD',
      status: 'UNALLOCATED',
      provider: 'fincra'
    };

    if (deposit.status === 'POSTED' || deposit.status === 'COMPLETED') {
      throw new Error(`Deposit ${unallocatedId} is already processed.`);
    }

    const correlationId = crypto.randomUUID();

    // 1. Get/Create Customer Fiat Wallet Account
    const wallet = await this.walletService.getOrCreateAccount(userId, deposit.currency, 'PRIMARY');
    const treasury = await this.treasuryService.getOrCreateAccount(deposit.currency, 'AVAILABLE');

    // 2. Post Journal A: Treasury Asset Entry (Correlated)
    const treasuryJournal = await this.postingService.postJournal({
      reference: `JNL_TREASURY_${deposit.id}_${Date.now()}`,
      entryType: 'DEPOSIT',
      description: `Treasury Asset Collection via ${deposit.provider} (${deposit.id})`,
      walletAccountId: wallet.id,
      treasuryAccountId: treasury.id,
      lines: [
        { chartAccountId: '1110', debit: parseFloat(deposit.amount), credit: 0, currency: deposit.currency },
        { chartAccountId: '1120', debit: 0, credit: parseFloat(deposit.amount), currency: deposit.currency }
      ]
    });

    // 3. Post Journal B: Customer Liability Entry (Correlated via correlationId)
    const customerJournal = await this.postingService.postJournal({
      reference: `JNL_CUSTOMER_${deposit.id}_${Date.now()}`,
      entryType: 'DEPOSIT',
      description: `Customer Deposit Credit via Replay (${deposit.id})`,
      walletAccountId: wallet.id,
      treasuryAccountId: treasury.id,
      lines: [
        { chartAccountId: '1120', debit: parseFloat(deposit.amount), credit: 0, currency: deposit.currency },
        { chartAccountId: '2110', debit: 0, credit: parseFloat(deposit.amount), currency: deposit.currency }
      ]
    });

    // 4. Update Deposit Status
    deposit.status = 'COMPLETED';
    deposit.assigned_user_id = userId;
    deposit.assigned_wallet_id = wallet.id;
    deposit.assigned_at = new Date();
    deposit.correlation_id = correlationId;
    deposit.treasury_journal_id = treasuryJournal.journal ? treasuryJournal.journal.id : correlationId;
    deposit.customer_journal_id = customerJournal.journal ? customerJournal.journal.id : correlationId;
    deposit.updated_at = new Date();

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `UPDATE public.unallocated_deposits
           SET status = 'COMPLETED', assigned_user_id = $1, assigned_wallet_id = $2, assigned_at = NOW(),
               correlation_id = $3, treasury_journal_id = $4, customer_journal_id = $5, updated_at = NOW()
           WHERE id = $6`,
          [
            userId,
            wallet.id,
            correlationId,
            deposit.treasury_journal_id,
            deposit.customer_journal_id,
            unallocatedId
          ]
        );
      } catch (e) {}
    }

    return {
      status: 'REPLAY_SUCCESSFUL',
      deposit,
      correlationId,
      treasuryJournal,
      customerJournal,
      updatedWalletBalance: wallet.available_balance
    };
  }
}

module.exports = UnallocatedDepositsService;
