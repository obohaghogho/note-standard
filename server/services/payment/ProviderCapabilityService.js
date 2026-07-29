'use strict';
/**
 * ProviderCapabilityService.js
 * ============================
 * Dynamic provider capability discovery.
 * Each provider exposes a live capability document that is cached at startup.
 * Eliminates the need to hardcode capabilities — new providers self-describe.
 *
 * Cache: in-memory Map, refreshed every 6 hours or on demand.
 *
 * Capability document shape:
 * {
 *   provider:           string
 *   version:            string
 *   supportsRefund:     boolean
 *   supportsReversal:   boolean
 *   supportsFX:         boolean
 *   supportsVirtualAccount: boolean
 *   supportedCurrencies: string[]
 *   supportedMethods:   string[]
 *   maxTransactionAmount: number|null
 *   environment:        'sandbox' | 'production'
 *   fetchedAt:          string (ISO)
 * }
 *
 * @module services/payment/ProviderCapabilityService
 */

const logger = require('../../utils/logger');
const { PAYMENT_PROVIDER_CAPABILITIES } = require('../../config/providerCapabilities');

// In-memory capability cache: provider → capability document
const _capabilityCache = new Map();
const CACHE_TTL_MS     = 6 * 60 * 60 * 1000; // 6 hours

// Lazy-load adapters to avoid circular deps
function _loadAdapter(name) {
  const map = {
    paystack:    () => require('./adapters/PaystackAdapter'),
    fincra:      () => require('./adapters/FincraAdapter'),
    grey:        () => require('./adapters/GreyAdapter'),
    anchor:      () => require('./adapters/AnchorAdapter'),
    nowpayments: () => require('./adapters/NowPaymentsAdapter'),
  };
  try { return map[name]?.(); } catch { return null; }
}

const ProviderCapabilityService = {
  /**
   * Discover and cache capabilities for a single provider.
   * Falls back to static PAYMENT_PROVIDER_CAPABILITIES if live discovery fails.
   *
   * @param {string} providerName
   * @returns {Promise<Object>} capability document
   */
  async discover(providerName) {
    const name = String(providerName).toLowerCase();

    // Return cached if fresh
    const cached = _capabilityCache.get(name);
    if (cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS) {
      return cached;
    }

    const staticCaps = PAYMENT_PROVIDER_CAPABILITIES[name];
    if (!staticCaps) {
      logger.warn(`[ProviderCapabilityService] Unknown provider: ${name}`);
      return null;
    }

    // Attempt live health check to confirm reachability
    let environment = 'unknown';
    let reachable   = false;

    try {
      const adapter = _loadAdapter(name);
      if (adapter?.healthCheck) {
        const health = await adapter.healthCheck();
        reachable   = health.status !== 'DOWN';
      }
      // Infer environment from known env flags
      environment = this._inferEnvironment(name);
    } catch (e) {
      logger.warn(`[ProviderCapabilityService] Live discovery failed for ${name}: ${e.message}`);
    }

    // Build capability document from static registry + live probe
    const capability = {
      provider:               name,
      version:                String(staticCaps.capabilityVersion || 1),
      supportsRefund:         staticCaps.refundsEnabled  || false,
      supportsReversal:       staticCaps.refundsEnabled  || false, // reversal = refund for now
      supportsFX:             staticCaps.supportedFeatures?.treasury || false,
      supportsVirtualAccount: staticCaps.dvaEnabled      || false,
      supportsSubscription:   staticCaps.subscriptionEnabled || false,
      supportedCurrencies:    staticCaps.merchantCurrencies  || [],
      supportedMethods:       staticCaps.methods             || [],
      maxTransactionAmount:   null,  // Provider-specific — populated by adapter if available
      maintenanceMode:        staticCaps.maintenanceMode || 'ACTIVE',
      merchantEnabled:        staticCaps.merchantEnabled || false,
      environment,
      reachable,
      fetchedAt:              new Date().toISOString(),
    };

    _capabilityCache.set(name, capability);
    logger.info(`[ProviderCapabilityService] Cached capabilities for ${name} (env=${environment}, reachable=${reachable})`);
    return capability;
  },

  /**
   * Discover capabilities for all registered providers.
   * @returns {Promise<Object>} keyed by provider name
   */
  async discoverAll() {
    const results = {};
    for (const name of Object.keys(PAYMENT_PROVIDER_CAPABILITIES)) {
      results[name] = await this.discover(name);
    }
    return results;
  },

  /**
   * Get cached capabilities without triggering a live refresh.
   * Returns static registry values if cache is empty.
   */
  getCached(providerName) {
    const name = String(providerName).toLowerCase();
    return _capabilityCache.get(name) || null;
  },

  /**
   * Force-refresh capabilities for a provider (bypasses TTL).
   */
  async refresh(providerName) {
    _capabilityCache.delete(String(providerName).toLowerCase());
    return this.discover(providerName);
  },

  /**
   * Check if a provider supports a specific capability.
   * @param {string} providerName
   * @param {'refund'|'reversal'|'fx'|'virtual_account'|'subscription'} capability
   */
  async supports(providerName, capability) {
    const doc = await this.discover(providerName);
    if (!doc) return false;
    const capMap = {
      refund:          doc.supportsRefund,
      reversal:        doc.supportsReversal,
      fx:              doc.supportsFX,
      virtual_account: doc.supportsVirtualAccount,
      subscription:    doc.supportsSubscription,
    };
    return capMap[capability] || false;
  },

  /**
   * [Phase 17] Infer provider environment from env vars.
   * Prevents production/sandbox mixing in routing.
   */
  _inferEnvironment(providerName) {
    const envMap = {
      fincra:      process.env.FINCRA_ENV,
      anchor:      process.env.ANCHOR_ENV,
      paystack:    process.env.PAYSTACK_ENV,
      grey:        process.env.GREY_ENV,
      nowpayments: process.env.NOWPAYMENTS_ENV,
    };
    const val = (envMap[providerName] || '').toLowerCase();
    if (val === 'live' || val === 'production') return 'production';
    if (val === 'sandbox' || val === 'test')    return 'sandbox';
    // Heuristic: if key contains 'test' or 'sandbox' it's likely sandbox
    const keyHint = (process.env[`${providerName.toUpperCase()}_API_KEY`] || '').toLowerCase();
    return keyHint.includes('test') || keyHint.includes('sandbox') ? 'sandbox' : 'unknown';
  },
};

module.exports = ProviderCapabilityService;
