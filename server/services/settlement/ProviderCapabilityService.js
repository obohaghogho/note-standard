'use strict';

/**
 * server/services/settlement/ProviderCapabilityService.js
 * ==========================================================
 * Database-Driven Provider Capability Registry Service.
 * Features:
 *  - Reads runtime capabilities from `provider_capabilities` DB table
 *  - 30-second TTL in-memory caching to avoid database overhead
 *  - Administrative `clearCache()` invalidation method when capabilities change
 */

const supabase = require('../../config/database');
const logger = require('../../utils/logger');

class ProviderCapabilityService {
  constructor() {
    this.cache = new Map();
    this.ttlMs = 30000; // 30s TTL
    this.lastFetchTime = 0;
  }

  clearCache() {
    this.cache.clear();
    this.lastFetchTime = 0;
    logger.info('[ProviderCapabilityService] In-memory capability cache cleared by administrator.');
  }

  async getAllCapabilities(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache.size > 0 && (now - this.lastFetchTime < this.ttlMs)) {
      return Array.from(this.cache.values());
    }

    try {
      const { data, error } = await supabase
        .from('provider_capabilities')
        .select('*')
        .order('provider', { ascending: true });

      if (error || !data || data.length === 0) {
        return this._getStaticFallback();
      }

      this.cache.clear();
      data.forEach(item => {
        const key = `${item.provider.toLowerCase()}:${item.feature.toLowerCase()}`;
        this.cache.set(key, item);
      });
      this.lastFetchTime = now;
      return data;
    } catch (err) {
      logger.warn(`[ProviderCapabilityService] DB query failed: ${err.message}. Using static fallback.`);
      return this._getStaticFallback();
    }
  }

  async isFeatureEnabled(provider, feature) {
    const pKey = String(provider || '').toLowerCase();
    const fKey = String(feature || '').toLowerCase();
    const key = `${pKey}:${fKey}`;

    await this.getAllCapabilities();
    const cached = this.cache.get(key);

    if (cached) {
      return cached.enabled && !cached.in_maintenance;
    }

    return true; // Default permissive fallback
  }

  _getStaticFallback() {
    return [
      { provider: 'fincra', feature: 'deposit_bank_transfer', enabled: true, version: 'v1', in_maintenance: false },
      { provider: 'fincra', feature: 'withdraw_bank_transfer', enabled: true, version: 'v1', in_maintenance: false },
      { provider: 'fincra', feature: 'virtual_account', enabled: true, version: 'v1', in_maintenance: false },
      { provider: 'grey', feature: 'ach', enabled: true, version: 'v1', in_maintenance: false },
      { provider: 'grey', feature: 'wire', enabled: true, version: 'v1', in_maintenance: false },
      { provider: 'grey', feature: 'fx', enabled: true, version: 'v1', in_maintenance: false }
    ];
  }
}

module.exports = new ProviderCapabilityService();
