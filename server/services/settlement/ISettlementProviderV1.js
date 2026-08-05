'use strict';

/**
 * ISettlementProviderV1
 * =====================
 * Enterprise Abstract Interface defining the common contract for all settlement providers
 * (Grey, Fincra, Anchor, NOWPayments, Rapyd, etc.).
 *
 * All settlement provider implementations MUST extend or fulfill this contract.
 * Wallet & Treasury business logic depend strictly on this interface.
 */

class ISettlementProviderV1 {
  getProviderId() {
    throw new Error("NOT_IMPLEMENTED: getProviderId()");
  }

  getCapabilities() {
    throw new Error("NOT_IMPLEMENTED: getCapabilities()");
  }

  async getBalance(currency) {
    throw new Error("NOT_IMPLEMENTED: getBalance()");
  }

  async getCustodyBalances() {
    return this.getBalance();
  }

  async createPayout({ address, amount, currency, network, reference, beneficiaryId }) {
    throw new Error("NOT_IMPLEMENTED: createPayout()");
  }

  async verifyWebhook(headers, payload) {
    return this.verifyWebhookSignature(headers, payload);
  }

  async verifyWebhookSignature(headers, payload) {
    throw new Error("NOT_IMPLEMENTED: verifyWebhookSignature()");
  }

  async getTransaction(reference) {
    throw new Error("NOT_IMPLEMENTED: getTransaction()");
  }

  async getExchangeRate(fromCurrency, toCurrency, amount = 1) {
    throw new Error("NOT_IMPLEMENTED: getExchangeRate()");
  }

  async getRateQuote(fromCurrency, toCurrency, amount = 1) {
    return this.getExchangeRate(fromCurrency, toCurrency, amount);
  }

  async createBeneficiary(data) {
    throw new Error("NOT_IMPLEMENTED: createBeneficiary()");
  }

  async verifyBeneficiary(accountNumber, bankCode) {
    throw new Error("NOT_IMPLEMENTED: verifyBeneficiary()");
  }

  async reverseTransaction(reference, reason) {
    throw new Error("NOT_IMPLEMENTED: reverseTransaction()");
  }

  async healthCheck() {
    throw new Error("NOT_IMPLEMENTED: healthCheck()");
  }

  async getDepositSettlementStatus(providerReference) {
    throw new Error("NOT_IMPLEMENTED: getDepositSettlementStatus()");
  }
}

module.exports = ISettlementProviderV1;
