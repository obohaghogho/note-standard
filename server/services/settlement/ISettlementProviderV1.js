'use strict';

/**
 * ISettlementProviderV1
 * =====================
 * Versioned abstract interface defining contract for all crypto & fiat
 * settlement provider adapters (NOWPayments, Fincra, Anchor, Fireblocks, etc.).
 */

class ISettlementProviderV1 {
  getProviderId() {
    throw new Error("NOT_IMPLEMENTED: getProviderId()");
  }

  getCapabilities() {
    throw new Error("NOT_IMPLEMENTED: getCapabilities()");
  }

  async getCustodyBalances() {
    throw new Error("NOT_IMPLEMENTED: getCustodyBalances()");
  }

  async createPayout({ address, amount, currency, network, reference }) {
    throw new Error("NOT_IMPLEMENTED: createPayout()");
  }

  async verifyWebhookSignature(headers, payload) {
    throw new Error("NOT_IMPLEMENTED: verifyWebhookSignature()");
  }

  async getRateQuote(fromCurrency, toCurrency, amount = 1) {
    throw new Error("NOT_IMPLEMENTED: getRateQuote()");
  }
}

module.exports = ISettlementProviderV1;
