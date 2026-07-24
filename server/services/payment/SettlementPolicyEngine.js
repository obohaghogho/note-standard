/**
 * SettlementPolicyEngine.js
 * ==========================
 * Decouples gateway processing currency from merchant settlement preferences.
 * Maps Gateway Processing Currency → Merchant Settlement Currency → Ledger Engine.
 *
 * Enterprise DFOS v6.4
 */

const logger = require('../../utils/logger');
const ConfigService = require('../ConfigService');

// Default Settlement Preference Matrix (overridable via environment/ConfigService)
const DEFAULT_SETTLEMENT_PREFERENCES = {
  NGN: "NGN",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  JPY: "USD", // JPY gateway charges settle in USD by default
  AUD: "USD", // AUD gateway charges settle in USD by default
  CAD: "USD", // CAD gateway charges settle in USD by default
  NZD: "USD", // NZD gateway charges settle in USD by default
};

class SettlementPolicyEngine {
  /**
   * Resolves the target merchant settlement currency for a given gateway processing currency.
   *
   * @param {string} gatewayCurrency - Processing currency at gateway level (e.g. 'USD', 'NGN')
   * @param {Object} [options]
   * @param {string} [options.merchantOverride] - Explicit merchant preference
   * @returns {string} Settlement currency (e.g. 'USD')
   */
  resolveSettlementCurrency(gatewayCurrency, options = {}) {
    const upGateway = String(gatewayCurrency).toUpperCase();

    if (options.merchantOverride) {
      logger.info(`[SettlementPolicyEngine] Overridden settlement target: ${upGateway} → ${options.merchantOverride}`);
      return String(options.merchantOverride).toUpperCase();
    }

    const configOverride = ConfigService.get(`SETTLEMENT_TARGET_${upGateway}`);
    if (configOverride) {
      return String(configOverride).toUpperCase();
    }

    const target = DEFAULT_SETTLEMENT_PREFERENCES[upGateway] || "USD";
    logger.info(`[SettlementPolicyEngine] Resolved settlement target for gateway ${upGateway}: ${target}`);
    return target;
  }
}

module.exports = new SettlementPolicyEngine();
