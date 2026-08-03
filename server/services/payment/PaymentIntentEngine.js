'use strict';

/**
 * PaymentIntentEngine.js
 * =======================
 * Engine for managing customer business payment intents.
 * Extended in Architecture v4.0 to support DepositInstructionPolicyService.
 * Lifecycle: CREATED -> ACTIVE -> COMPLETED / CANCELLED / EXPIRED.
 */
class PaymentIntentEngine {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    this.inMemoryIntents = new Map();
  }

  /**
   * Create a new business payment intent
   */
  async createIntent(intentData) {
    const { userId, walletAccountId, currency, amount, purpose, provider } = intentData;
    if (!userId) throw new Error('userId is required');
    if (!currency) throw new Error('currency is required');
    if (!amount || amount <= 0) throw new Error('amount must be positive');

    const intentRecord = {
      id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      user_id: userId,
      wallet_account_id: walletAccountId || null,
      currency: currency.toUpperCase(),
      amount: parseFloat(amount),
      purpose: purpose || 'DEPOSIT',
      provider: provider || 'fincra',
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 3600000), // 1 hour expiration
      created_at: new Date(),
      updated_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `INSERT INTO public.payment_intents 
           (user_id, wallet_account_id, currency, amount, purpose, provider, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)
           RETURNING *`,
          [intentRecord.user_id, intentRecord.wallet_account_id, intentRecord.currency, intentRecord.amount, intentRecord.purpose, intentRecord.provider, intentRecord.expires_at]
        );
        if (res.rows && res.rows.length > 0) {
          intentRecord.id = res.rows[0].id;
        }
      } catch (err) {
        // Fallback
      }
    }

    this.inMemoryIntents.set(intentRecord.id, intentRecord);
    return intentRecord;
  }

  /**
   * Generate deposit instructions attaching Merchant Collection Account or Virtual Account
   */
  async generateDepositInstructions(params, services = {}) {
    const DepositInstructionPolicyService = require('./DepositInstructionPolicyService');
    const CollectionAccountService = require('./CollectionAccountService');
    const DepositReferenceService = require('./DepositReferenceService');

    const collectionAccountService = services.collectionAccountService || new CollectionAccountService(this.db);
    const depositRefService = services.depositRefService || new DepositReferenceService(this.db);

    const policyService = new DepositInstructionPolicyService({
      collectionAccountService,
      depositRefService,
      paymentIntentEngine: this
    });

    return policyService.generateDepositInstructions(params);
  }

  /**
   * Complete payment intent
   */
  async completeIntent(intentId) {
    const intent = this.inMemoryIntents.get(intentId) || { id: intentId, status: 'ACTIVE' };
    intent.status = 'COMPLETED';
    intent.updated_at = new Date();

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `UPDATE public.payment_intents SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
          [intentId]
        );
      } catch (err) {
        // Fallback
      }
    }

    return intent;
  }

  /**
   * Expire stale intents
   */
  async expireStaleIntents() {
    const now = new Date();
    let expiredCount = 0;

    for (const [id, intent] of this.inMemoryIntents.entries()) {
      if (intent.status === 'ACTIVE' && intent.expires_at < now) {
        intent.status = 'EXPIRED';
        expiredCount++;
      }
    }

    return { expiredCount };
  }
}

module.exports = PaymentIntentEngine;
