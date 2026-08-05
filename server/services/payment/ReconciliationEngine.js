'use strict';

/**
 * server/services/payment/ReconciliationEngine.js
 * =================================================
 * Export wrapper pointing to ReconciliationEngine in services/reconciliation.
 */

const ReconciliationEngine = require('../reconciliation/ReconciliationEngine');

module.exports = new ReconciliationEngine();
