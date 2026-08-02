'use strict';

/**
 * PaymentExecutionCoordinator.js
 * ==============================
 * Central application workflow coordinator for NoteStandard Enterprise Banking.
 * Orchestrates: Intent -> Session -> Provider Execution -> Transaction -> Lifecycle -> Posting -> Outbox.
 * Retries, timeout handling, and trace propagation belong exclusively to this coordinator.
 */
class PaymentExecutionCoordinator {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    const PaymentIntentEngine = require('./PaymentIntentEngine');
    const PaymentSessionService = require('./PaymentSessionService');
    const TransactionLifecycleService = require('./TransactionLifecycleService');
    const ProviderRouter = require('../ProviderRouter');

    this.intentEngine = options.intentEngine || new PaymentIntentEngine(this.db);
    this.sessionService = options.sessionService || new PaymentSessionService(this.db);
    this.txLifecycle = options.txLifecycle || new TransactionLifecycleService(this.db);
    this.providerRouter = options.providerRouter || ProviderRouter;
  }

  /**
   * Initiate deposit checkout flow
   */
  async initiateDeposit(params) {
    const { userId, walletAccountId, currency, amount, traceId, correlationId } = params;
    if (!userId) throw new Error('userId is required');
    if (!currency) throw new Error('currency is required');
    if (!amount || amount <= 0) throw new Error('amount must be positive');

    // 1. Resolve Provider via Router
    const providerName = this.providerRouter.getProvider(currency, 'deposit');

    // 2. Create Payment Intent
    const intent = await this.intentEngine.createIntent({
      userId,
      walletAccountId,
      currency,
      amount,
      purpose: 'DEPOSIT',
      provider: providerName
    });

    // 3. Create Checkout Session v1
    const providerRef = `REF_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const checkoutUrl = `https://checkout.${providerName}.com/pay/${providerRef}`;

    const session = await this.sessionService.createSession({
      intentId: intent.id,
      provider: providerName,
      checkoutUrl,
      providerReference: providerRef
    });

    // 4. Create Transaction Record
    const transaction = await this.txLifecycle.createTransaction({
      intentId: intent.id,
      sessionId: session.id,
      userId,
      providerReference: providerRef,
      provider: providerName,
      currency,
      amount,
      traceId,
      correlationId
    });

    return {
      intent,
      session,
      transaction,
      checkoutUrl
    };
  }
}

module.exports = PaymentExecutionCoordinator;
