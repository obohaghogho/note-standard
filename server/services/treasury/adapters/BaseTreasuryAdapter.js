'use strict';

/**
 * BaseTreasuryAdapter.js
 * =======================
 * Canonical Provider Independence Interface for NoteStandard Enterprise Treasury.
 *
 * Every payment, banking, crypto, or settlement provider MUST extend this adapter.
 * Enforces a strict 11-capability contract:
 *   1.  getBalances()
 *   2.  getAvailableLiquidity(currency)
 *   3.  getLockedLiquidity(currency)
 *   4.  createSettlement(params)
 *   5.  fundTreasury(params)
 *   6.  executePayout(params)
 *   7.  getSettlementStatus(reference)
 *   8.  healthCheck()
 *   9.  getFxQuote(fromCurrency, toCurrency, amount)
 *   10. createBeneficiary(params)
 *   11. reconcileTransactions(params)
 *
 * @module services/treasury/adapters/BaseTreasuryAdapter
 */

class BaseTreasuryAdapter {
  constructor(providerId, capabilities = {}) {
    if (new.target === BaseTreasuryAdapter) {
      throw new TypeError("Cannot instantiate abstract class BaseTreasuryAdapter directly.");
    }
    this.providerId = String(providerId).toUpperCase();
    this.capabilities = {
      supportsDeposits:            capabilities.supportsDeposits ?? true,
      supportsWithdrawals:         capabilities.supportsWithdrawals ?? true,
      supportsSwaps:               capabilities.supportsSwaps ?? true,
      supportsFx:                  capabilities.supportsFx ?? true,
      supportsVirtualAccounts:     capabilities.supportsVirtualAccounts ?? false,
      supportsBeneficiary:         capabilities.supportsBeneficiary ?? true,
      supportsWebhook:             capabilities.supportsWebhook ?? true,
      supportsSettlement:          capabilities.supportsSettlement ?? true,
      supportsReconciliation:      capabilities.supportsReconciliation ?? true,
      supportedCurrencies:         capabilities.supportedCurrencies || ['NGN', 'USD'],
      baseFee:                     capabilities.baseFee ?? 0,
      feePercentage:               capabilities.feePercentage ?? 0,
      avgSettlementTimeSeconds:    capabilities.avgSettlementTimeSeconds ?? 300,
    };
  }

  getProviderId() {
    return this.providerId;
  }

  getCapabilities() {
    return { ...this.capabilities };
  }

  /** 1. Get Custody Balances */
  async getBalances() {
    throw new Error(`[${this.providerId}] Method getBalances() must be implemented.`);
  }

  /** 2. Get Available Liquidity for specific currency */
  async getAvailableLiquidity(currency) {
    throw new Error(`[${this.providerId}] Method getAvailableLiquidity() must be implemented.`);
  }

  /** 3. Get Locked Liquidity for specific currency */
  async getLockedLiquidity(currency) {
    throw new Error(`[${this.providerId}] Method getLockedLiquidity() must be implemented.`);
  }

  /** 4. Create Settlement */
  async createSettlement(params) {
    throw new Error(`[${this.providerId}] Method createSettlement() must be implemented.`);
  }

  /** 5. Fund Treasury */
  async fundTreasury(params) {
    throw new Error(`[${this.providerId}] Method fundTreasury() must be implemented.`);
  }

  /** 6. Execute Payout */
  async executePayout(params) {
    throw new Error(`[${this.providerId}] Method executePayout() must be implemented.`);
  }

  /** 7. Get Settlement Status */
  async getSettlementStatus(reference) {
    throw new Error(`[${this.providerId}] Method getSettlementStatus() must be implemented.`);
  }

  /** 8. Health Check */
  async healthCheck() {
    throw new Error(`[${this.providerId}] Method healthCheck() must be implemented.`);
  }

  /** 9. Get FX Quote */
  async getFxQuote(fromCurrency, toCurrency, amount) {
    throw new Error(`[${this.providerId}] Method getFxQuote() must be implemented.`);
  }

  /** 10. Create Beneficiary */
  async createBeneficiary(params) {
    throw new Error(`[${this.providerId}] Method createBeneficiary() must be implemented.`);
  }

  /** 11. Reconcile Transactions */
  async reconcileTransactions(params) {
    throw new Error(`[${this.providerId}] Method reconcileTransactions() must be implemented.`);
  }
}

module.exports = BaseTreasuryAdapter;
