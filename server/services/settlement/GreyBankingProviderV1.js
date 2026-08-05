'use strict';

/**
 * server/services/settlement/GreyBankingProviderV1.js
 * ====================================================
 * Enterprise Versioned Banking Adapter (v1) for Grey Business Lead Bank USD Account.
 */

const GreyBankingProvider = require('./GreyBankingProvider');

class GreyBankingProviderV1 extends GreyBankingProvider {
  constructor() {
    super();
    this.version = 'v1';
  }

  getVersion() {
    return 'v1';
  }

  getCapabilities() {
    const baseCaps = super.getCapabilities();
    return {
      ...baseCaps,
      version: 'v1'
    };
  }
}

module.exports = GreyBankingProviderV1;
