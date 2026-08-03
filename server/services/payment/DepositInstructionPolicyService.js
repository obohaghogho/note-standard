'use strict';

const ProviderCapabilityRegistry = require('./ProviderCapabilityRegistry');

/**
 * DepositInstructionPolicyService.js
 * ====================================
 * Core Policy Engine orchestrating deposit instructions generation.
 * Responsibilities:
 *  1. Interrogates ProviderCapabilityRegistry to check strategy (Virtual Account vs Merchant Collection).
 *  2. Fetches active Collection Account from CollectionAccountService.
 *  3. Generates Payment Intent & Deposit Reference(s) via DepositReferenceService.
 *  4. Formats rich versioned deposit instructions response payload.
 */
class DepositInstructionPolicyService {
  constructor(options = {}) {
    this.capabilityRegistry = options.capabilityRegistry || ProviderCapabilityRegistry;
    this.collectionAccountService = options.collectionAccountService;
    this.depositRefService = options.depositRefService;
    this.paymentIntentEngine = options.paymentIntentEngine;
  }

  /**
   * Generate deposit instructions for a user and currency
   */
  async generateDepositInstructions(params) {
    const {
      userId,
      walletAccountId,
      currency,
      amount = 0,
      rail = null,
      provider = 'fincra',
      amountValidationMode = 'OPEN_AMOUNT'
    } = params;

    if (!userId) throw new Error('userId is required');
    if (!currency) throw new Error('currency is required');

    const normCurr = currency.toUpperCase();
    const normProvider = provider.toLowerCase();

    // 1. Determine Strategy via ProviderCapabilityRegistry
    let capabilities = {};
    try {
      capabilities = await this.capabilityRegistry.getCapabilities(normProvider);
    } catch (e) {
      capabilities = {
        supportsCustomerVirtualAccount: false,
        supportsMerchantCollection: true,
        supportedCurrencies: ['EUR', 'GBP', 'USD', 'NGN'],
        supportedRails: ['SEPA', 'FASTER_PAYMENTS', 'ACH', 'LOCAL']
      };
    }

    const supportsDVA = capabilities.supportsCustomerVirtualAccount && normCurr === 'NGN';
    const strategy = supportsDVA ? 'CUSTOMER_VIRTUAL' : 'MERCHANT_COLLECTION';

    // 2. Fetch Collection Account Details
    const defaultRail = rail || (normCurr === 'EUR' ? 'SEPA' : normCurr === 'GBP' ? 'FASTER_PAYMENTS' : normCurr === 'USD' ? 'ACH' : 'LOCAL');
    const collectionAccount = await this.collectionAccountService.getActiveCollectionAccount(
      normProvider,
      normCurr,
      defaultRail
    );

    // 3. Create or attach Payment Intent
    let intent = null;
    if (this.paymentIntentEngine) {
      intent = await this.paymentIntentEngine.createIntent({
        userId,
        walletAccountId,
        currency: normCurr,
        amount: amount || 100,
        purpose: 'DEPOSIT',
        provider: normProvider
      });
    } else {
      intent = {
        id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        status: 'ACTIVE'
      };
    }

    // 4. Generate Unique Deposit Reference
    let depositRef = null;
    if (this.depositRefService) {
      depositRef = await this.depositRefService.createReference({
        userId,
        walletId: walletAccountId || `w_${userId}`,
        currency: normCurr,
        rail: defaultRail,
        paymentIntentId: intent.id,
        expectedAmount: amount,
        amountValidationMode,
        ttlHours: 72
      });
    } else {
      depositRef = {
        reference: `NS-${normCurr}-${Math.floor(100000 + Math.random() * 900000)}`,
        expires_at: new Date(Date.now() + 72 * 3600 * 1000),
        status: 'AWAITING_PAYMENT'
      };
    }

    // 5. Build Rich Versioned Response Payload
    return {
      instructionVersion: 'v1.0',
      providerCapabilityVersion: 'v2.4',
      depositStrategy: strategy,
      paymentIntentId: intent.id,
      reference: depositRef.reference,
      idempotencyKey: depositRef.idempotency_key,
      referenceStatus: depositRef.status,
      expiresAt: depositRef.expires_at,
      provider: normProvider,
      currency: normCurr,
      paymentRail: collectionAccount.rail,
      amount: parseFloat(amount || 0),
      amountValidationMode,
      beneficiary: collectionAccount.beneficiary,
      bankName: collectionAccount.bank_name,
      iban: collectionAccount.iban,
      accountNumber: collectionAccount.account_number,
      sortCode: collectionAccount.sort_code,
      swift: collectionAccount.swift,
      country: collectionAccount.country,
      supportedCountries: ['US', 'GB', 'LU', 'NG', 'DE', 'FR', 'ES', 'IT', 'NL', 'CA', 'AU', 'CH', 'JP']
    };
  }
}

module.exports = DepositInstructionPolicyService;
