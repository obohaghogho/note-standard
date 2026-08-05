'use strict';

/**
 * IBankingProvider
 * =================
 * Abstract Interface contract defining standard operations for banking and collection providers
 * (Grey, Fincra, Anchor, Rapyd, etc.).
 *
 * All banking providers MUST fulfill this interface to plug into BankingProviderRouter.
 */
class IBankingProvider {
  getProviderId() {
    throw new Error("NOT_IMPLEMENTED: getProviderId()");
  }

  getCapabilities() {
    throw new Error("NOT_IMPLEMENTED: getCapabilities()");
  }

  async getAccountDetails(params = {}) {
    throw new Error("NOT_IMPLEMENTED: getAccountDetails()");
  }

  async createDepositInstructions(params = {}) {
    throw new Error("NOT_IMPLEMENTED: createDepositInstructions()");
  }

  async getTransactions(params = {}) {
    throw new Error("NOT_IMPLEMENTED: getTransactions()");
  }

  async getIncomingTransfers(params = {}) {
    throw new Error("NOT_IMPLEMENTED: getIncomingTransfers()");
  }

  async verifyWebhook(headers, payload) {
    throw new Error("NOT_IMPLEMENTED: verifyWebhook()");
  }

  async getBalance(currency = null) {
    throw new Error("NOT_IMPLEMENTED: getBalance()");
  }

  async createPayout(payoutData) {
    throw new Error("NOT_IMPLEMENTED: createPayout()");
  }

  async healthCheck() {
    throw new Error("NOT_IMPLEMENTED: healthCheck()");
  }
}

module.exports = IBankingProvider;
