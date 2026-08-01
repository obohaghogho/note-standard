'use strict';

/**
 * AdapterRegistry.js
 * ==================
 * Central Registry managing all Provider Independence Adapters.
 * Allows plug-and-play addition of future providers (Stripe Treasury, Wise Platform, etc.)
 * without touching core system logic.
 *
 * @module services/treasury/adapters/AdapterRegistry
 */

const BaseTreasuryAdapter = require('./BaseTreasuryAdapter');
const NOWPaymentsAdapter  = require('./NOWPaymentsAdapter');
const FincraAdapter       = require('./FincraAdapter');
const AnchorAdapter       = require('./AnchorAdapter');
const logger              = require('../../../utils/logger');

class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this._initializeDefaults();
  }

  _initializeDefaults() {
    this.register(new NOWPaymentsAdapter());
    this.register(new FincraAdapter());
    this.register(new AnchorAdapter());
  }

  /**
   * Register a new provider adapter.
   * Must inherit from BaseTreasuryAdapter.
   */
  register(adapter) {
    if (!(adapter instanceof BaseTreasuryAdapter)) {
      throw new TypeError("Registered adapter must extend BaseTreasuryAdapter.");
    }
    const id = adapter.getProviderId().toUpperCase();
    this.adapters.set(id, adapter);
    logger.info(`[AdapterRegistry] Registered treasury provider adapter: ${id}`);
  }

  /**
   * Get provider adapter by ID.
   */
  get(providerId) {
    const id = String(providerId).toUpperCase();
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Treasury provider adapter '${id}' is not registered.`);
    }
    return adapter;
  }

  /**
   * Check if adapter is registered.
   */
  has(providerId) {
    return this.adapters.has(String(providerId).toUpperCase());
  }

  /**
   * Get all registered provider IDs.
   */
  getRegisteredProviderIds() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters.
   */
  getAll() {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters supporting a specific currency and operation.
   */
  getSupportingAdapters(currency, operation = 'withdraw') {
    const cur = String(currency).toUpperCase();
    const results = [];

    for (const adapter of this.adapters.values()) {
      const caps = adapter.getCapabilities();
      if (caps.supportedCurrencies.includes(cur)) {
        if (operation === 'withdraw' && caps.supportsWithdrawals) results.push(adapter);
        else if (operation === 'deposit' && caps.supportsDeposits) results.push(adapter);
        else if (operation === 'swap' && caps.supportsSwaps) results.push(adapter);
        else if (operation === 'fx' && caps.supportsFx) results.push(adapter);
      }
    }
    return results;
  }
}

module.exports = new AdapterRegistry();
