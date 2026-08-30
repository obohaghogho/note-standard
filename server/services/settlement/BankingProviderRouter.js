'use strict';

/**
 * server/services/settlement/BankingProviderRouter.js
 * ====================================================
 * Provider-Agnostic Multi-Factor Banking & Collection Router.
 * Features:
 *  - Evaluates Currency, Rail, Provider Health Score (0-100), and DB Capabilities.
 *  - Routes NGN to FincraBankingProviderV1 (Guaranty Trust Bank).
 *  - Routes USD to GreyBankingProviderV1 (Lead Bank).
 *  - Extensible for future providers (Anchor, Rapyd, Cignum) without UI or ledger code changes.
 */

const logger = require('../../utils/logger');
const FincraBankingProviderV1 = require('./FincraBankingProviderV1');
const GreyBankingProviderV1 = require('./GreyBankingProviderV1');
const AnchorBankingProviderV1 = require('./AnchorBankingProviderV1');
const ProviderHealthScorerService = require('./ProviderHealthScorerService');

class BankingProviderRouter {
  constructor() {
    this.providers = new Map();
    this._registerDefaultProviders();
  }

  _registerDefaultProviders() {
    const fincra = new FincraBankingProviderV1();
    this.providers.set(fincra.getProviderId().toLowerCase(), fincra);

    const grey = new GreyBankingProviderV1();
    this.providers.set(grey.getProviderId().toLowerCase(), grey);

    const anchor = new AnchorBankingProviderV1();
    this.providers.set(anchor.getProviderId().toLowerCase(), anchor);
  }

  registerProvider(providerInstance) {
    if (!providerInstance || typeof providerInstance.getProviderId !== 'function') {
      throw new Error('Invalid banking provider instance');
    }
    const id = String(providerInstance.getProviderId()).toLowerCase();
    this.providers.set(id, providerInstance);
    logger.info(`[BankingProviderRouter] Registered banking provider: ${id} (${providerInstance.getVersion?.() || 'v1'})`);
  }

  getProvider(providerId) {
    const pId = String(providerId || 'fincra').toLowerCase();
    const provider = this.providers.get(pId);
    if (!provider) {
      throw new Error(`Banking provider '${providerId}' not registered`);
    }
    return provider;
  }

  /**
   * Multi-Factor Provider Routing Engine.
   * Evaluates currency, rail, capabilities, and health score (0-100).
   */
  selectBestBankingProvider({ currency = 'NGN', rail = 'BANK_TRANSFER' }) {
    const upCurr = String(currency).toUpperCase();
    const candidates = [];

    for (const [id, instance] of this.providers.entries()) {
      const caps = instance.getCapabilities();

      if (caps.supportedCurrencies && caps.supportedCurrencies.includes(upCurr)) {
        const healthReport = ProviderHealthScorerService.getHealthReport(id);
        candidates.push({
          providerId: id,
          provider: instance,
          healthScore: healthReport.healthScore,
          status: healthReport.status
        });
      }
    }

    if (candidates.length === 0) {
      const fallbackId = upCurr === 'USD' ? 'grey' : 'fincra';
      return { providerId: fallbackId, provider: this.getProvider(fallbackId) };
    }

    // Sort by Health Score descending
    candidates.sort((a, b) => b.healthScore - a.healthScore);
    return candidates[0];
  }

  async getDepositInstructions({ currency = 'NGN', rail = 'BANK_TRANSFER', userId, provider: requestedProvider }) {
    let targetProvider;
    if (requestedProvider && this.providers.has(String(requestedProvider).toLowerCase())) {
      targetProvider = this.getProvider(requestedProvider);
    } else {
      const selected = this.selectBestBankingProvider({ currency, rail });
      targetProvider = selected.provider;
    }
    return targetProvider.createDepositInstructions({ currency, rail, userId });
  }
}

module.exports = new BankingProviderRouter();
