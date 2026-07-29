'use strict';
/**
 * services/payment/PaymentPolicyEngine.js
 * ========================================
 * Re-export shim — delegates to the canonical PaymentPolicyEngine
 * in services/orchestration/PaymentPolicyEngine.js.
 *
 * Exists here so that any code under services/payment/ that imports
 * PaymentPolicyEngine finds a local relative path without hitting a
 * circular-dependency loop through the orchestration layer.
 *
 * @module services/payment/PaymentPolicyEngine
 */

module.exports = require('../orchestration/PaymentPolicyEngine');
