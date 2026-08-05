'use strict';

/**
 * server/services/settlement/GreySettlementProviderV1.js
 * ========================================================
 * Enterprise Versioned Settlement Adapter (v1) for Grey Business FX & Payouts.
 */

const GreySettlementProvider = require('./GreySettlementProvider');

class GreySettlementProviderV1 extends GreySettlementProvider {
  constructor() {
    super();
    this.version = 'v1';
  }

  getVersion() {
    return 'v1';
  }
}

module.exports = GreySettlementProviderV1;
