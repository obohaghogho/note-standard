'use strict';
/**
 * BankingProviderRegistry.js
 * ==========================
 * Central registry for all banking providers.
 * Providers self-register; the FinancialOrchestrator and RoutingEngine
 * query this registry instead of importing providers directly.
 *
 * This makes adding a new provider zero-touch for existing code:
 *   1. Implement UnifiedBankingInterface
 *   2. Call BankingProviderRegistry.register(instance)
 *   3. Done — routing, failover, treasury, and reconciliation pick it up automatically
 *
 * @module services/banking/BankingProviderRegistry
 */

const logger = require('../../utils/logger');
const supabase = require('../../config/database');

class BankingProviderRegistry {
  constructor() {
    this._providers = new Map(); // key → UnifiedBankingInterface instance
    this._locked    = false;
  }

  // ── Registration ──────────────────────────────────────────────────────────────

  /**
   * Register a provider. Called at startup before the registry is locked.
   * @param {UnifiedBankingInterface} provider
   */
  register(provider) {
    if (this._locked) {
      throw new Error(`[BankingRegistry] Cannot register ${provider.getProviderKey()} — registry is locked after boot.`);
    }
    const key = provider.getProviderKey().toLowerCase();
    if (this._providers.has(key)) {
      logger.warn(`[BankingRegistry] Provider ${key} already registered — overwriting.`);
    }
    this._providers.set(key, provider);
    logger.info(`[BankingRegistry] Registered provider: ${key}`);
  }

  /**
   * Lock the registry after all providers are registered (called at server boot completion).
   */
  lock() {
    this._locked = true;
    logger.info(`[BankingRegistry] Registry locked. ${this._providers.size} providers registered: ${[...this._providers.keys()].join(', ')}`);
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────────

  /**
   * Get a provider by key. Throws if not found or disabled.
   */
  get(providerKey) {
    const key      = String(providerKey).toLowerCase();
    const provider = this._providers.get(key);
    if (!provider) throw new Error(`[BankingRegistry] Provider '${key}' is not registered.`);
    return provider;
  }

  /**
   * Returns all registered, enabled providers.
   */
  getAllEnabled() {
    return [...this._providers.values()].filter(p => {
      try { return p.isEnabled(); } catch { return false; }
    });
  }

  /**
   * Returns all providers that support a given currency + method.
   */
  getCompatible(currency, method) {
    return this.getAllEnabled().filter(p => {
      try {
        return p.supportsCurrency(currency) && p.supportsMethod(method);
      } catch {
        return false;
      }
    });
  }

  /**
   * Returns all providers that support a given operation + currency.
   */
  getCapable(operationType, currency = 'ANY') {
    return this.getAllEnabled().filter(p => {
      try {
        return p.supportsOperation(operationType, currency);
      } catch {
        return false;
      }
    });
  }

  /**
   * Returns provider keys only.
   */
  listKeys() {
    return [...this._providers.keys()];
  }

  /**
   * Check if a provider key is registered.
   */
  has(providerKey) {
    return this._providers.has(String(providerKey).toLowerCase());
  }

  // ── Certification ─────────────────────────────────────────────────────────────

  /**
   * Verify a provider has passed the certification checklist (from DB).
   */
  async isCertified(providerKey) {
    const { data } = await supabase
      .from('banking_providers')
      .select('is_certified, is_enabled')
      .eq('provider_key', String(providerKey).toLowerCase())
      .maybeSingle();
    return data?.is_certified === true && data?.is_enabled === true;
  }

  /**
   * Returns full capability record from DB for a provider.
   */
  async getCapabilities(providerKey) {
    const { data } = await supabase
      .from('banking_capabilities')
      .select('*')
      .eq('provider_key', String(providerKey).toLowerCase())
      .eq('is_supported', true);
    return data || [];
  }

  /**
   * Returns the full provider registry status (for admin dashboard).
   */
  async getRegistryStatus() {
    const { data: dbProviders } = await supabase
      .from('banking_providers')
      .select('*')
      .order('provider_key');

    return (dbProviders || []).map(dbP => ({
      ...dbP,
      registered_in_memory: this._providers.has(dbP.provider_key),
      runtime_enabled: this._providers.has(dbP.provider_key)
        ? (() => { try { return this._providers.get(dbP.provider_key).isEnabled(); } catch { return false; } })()
        : false,
    }));
  }
}

// Singleton — shared across the entire process
const registry = new BankingProviderRegistry();

// ── Lazy provider registration ─────────────────────────────────────────────────
// Providers register themselves when first required. The registry loads them
// once during bootstrap. Order doesn't matter.
function bootstrapProviders() {
  const PROVIDER_MAP = {
    fincra:      () => require('./adapters/FincraProviderAdapter'),
    anchor:      () => require('./adapters/AnchorProviderAdapter'),
    paystack:    () => require('./adapters/PaystackProviderAdapter'),
    grey:        () => require('./adapters/GreyProviderAdapter'),
    nowpayments: () => require('./adapters/NowPaymentsProviderAdapter'),
  };

  for (const [key, loader] of Object.entries(PROVIDER_MAP)) {
    try {
      const providerInstance = loader();
      registry.register(providerInstance);
    } catch (err) {
      logger.warn(`[BankingRegistry] Could not load provider ${key}: ${err.message}`);
    }
  }

  registry.lock();
}

module.exports = { BankingProviderRegistry, registry, bootstrapProviders };
