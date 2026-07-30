'use strict';

/**
 * ProviderRegistry
 * ================
 * Central registry for registering and resolving settlement provider adapters
 * (NOWPAYMENTS, FINCRA, ANCHOR, FIREBLOCKS, CIRCLE, etc.).
 */

const logger = require('../../utils/logger');

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(providerId, providerInstance) {
    const upId = String(providerId).toUpperCase();
    this.providers.set(upId, providerInstance);
    logger.info(`[ProviderRegistry] Registered provider: ${upId}`);
  }

  getProvider(providerId) {
    const upId = String(providerId).toUpperCase();
    const provider = this.providers.get(upId);
    if (!provider) {
      throw new Error(`UNREGISTERED_PROVIDER: Settlement provider '${upId}' is not registered in ProviderRegistry.`);
    }
    return provider;
  }

  hasProvider(providerId) {
    return this.providers.has(String(providerId).toUpperCase());
  }

  getRegisteredProviderIds() {
    return Array.from(this.providers.keys());
  }

  getCapabilities(providerId) {
    const provider = this.getProvider(providerId);
    return provider.getCapabilities ? provider.getCapabilities() : {};
  }
}

module.exports = new ProviderRegistry();
