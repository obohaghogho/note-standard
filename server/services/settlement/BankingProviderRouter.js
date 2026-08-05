'use strict';

const logger = require('../../utils/logger');
const GreyBankingProvider = require('./GreyBankingProvider');
const FincraSettlementProvider = require('./FincraSettlementProvider');
const AnchorSettlementProvider = require('./AnchorSettlementProvider');

/**
 * BankingProviderRouter
 * =====================
 * Provider-agnostic banking & collection router.
 * Dynamically selects banking providers based on capabilities, currency, and rail requirements.
 */
class BankingProviderRouter {
  constructor() {
    this.providers = new Map();
    this._registerDefaultProviders();
  }

  _registerDefaultProviders() {
    const grey = new GreyBankingProvider();
    this.providers.set(grey.getProviderId(), grey);

    try {
      const fincra = new FincraSettlementProvider();
      this.providers.set('fincra', fincra);
    } catch { /* optional provider */ }

    try {
      const anchor = new AnchorSettlementProvider();
      this.providers.set('anchor', anchor);
    } catch { /* optional provider */ }
  }

  registerProvider(providerInstance) {
    if (!providerInstance || typeof providerInstance.getProviderId !== 'function') {
      throw new Error('Invalid banking provider instance');
    }
    this.providers.set(providerInstance.getProviderId(), providerInstance);
    logger.info(`[BankingProviderRouter] Registered banking provider: ${providerInstance.getProviderId()}`);
  }

  getProvider(providerId = 'grey') {
    const provider = this.providers.get(String(providerId).toLowerCase());
    if (!provider) {
      throw new Error(`Banking provider '${providerId}' not registered`);
    }
    return provider;
  }

  selectBestBankingProvider({ currency = 'USD', rail = 'ACH' }) {
    const upCurr = String(currency).toUpperCase();
    const upRail = String(rail).toUpperCase();

    for (const [id, instance] of this.providers.entries()) {
      if (typeof instance.getCapabilities !== 'function') continue;
      const caps = instance.getCapabilities();

      if (caps.supportedCurrencies && caps.supportedCurrencies.includes(upCurr)) {
        if (upRail === 'ACH' && caps.supportsACH) return { providerId: id, provider: instance };
        if (upRail === 'WIRE' && caps.supportsWire) return { providerId: id, provider: instance };
        return { providerId: id, provider: instance };
      }
    }

    // Default fallback
    return { providerId: 'grey', provider: this.getProvider('grey') };
  }

  async getDepositInstructions({ currency = 'USD', rail = 'ACH', userId }) {
    const { provider } = this.selectBestBankingProvider({ currency, rail });
    return provider.createDepositInstructions({ currency, rail, userId });
  }
}

module.exports = new BankingProviderRouter();
