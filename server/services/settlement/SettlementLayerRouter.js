'use strict';

/**
 * SettlementLayerRouter
 * ====================
 * Unified router managing settlement providers, automated failover routing,
 * and liquidity checking across registered settlement provider adapters.
 */

const providerRegistry = require('./ProviderRegistry');
const NOWPaymentsSettlementProvider = require('./NOWPaymentsSettlementProvider');
const FincraSettlementProvider = require('./FincraSettlementProvider');
const AnchorSettlementProvider = require('./AnchorSettlementProvider');
const logger = require('../../utils/logger');

class SettlementLayerRouter {
  constructor() {
    // Register initial settlement providers into ProviderRegistry
    providerRegistry.register('NOWPAYMENTS', NOWPaymentsSettlementProvider);
    providerRegistry.register('FINCRA', FincraSettlementProvider);
    providerRegistry.register('ANCHOR', AnchorSettlementProvider);
  }

  /**
   * Determine primary and fallback settlement providers for a currency
   */
  getProviderPriorityList(currency) {
    const upCurr = String(currency).toUpperCase();
    if (['BTC', 'ETH', 'USDT', 'USDC'].includes(upCurr)) {
      return ['NOWPAYMENTS', 'FINCRA', 'ANCHOR'];
    }
    return ['FINCRA', 'ANCHOR', 'NOWPAYMENTS'];
  }

  /**
   * Execute payout with automated provider failover
   */
  async executePayoutWithFailover({ address, amount, currency, network = 'NATIVE', reference }) {
    const priorityList = this.getProviderPriorityList(currency);
    let lastError = null;

    for (const providerId of priorityList) {
      if (!providerRegistry.hasProvider(providerId)) continue;
      
      const provider = providerRegistry.getProvider(providerId);
      const caps = provider.getCapabilities();

      if (!caps.supports_withdrawals) continue;

      try {
        logger.info(`[SettlementLayerRouter] Attempting payout via ${providerId}...`);
        const result = await provider.createPayout({ address, amount, currency, network, reference });
        logger.info(`[SettlementLayerRouter] Payout succeeded via ${providerId}. ID: ${result.payoutId}`);
        return { ...result, providerId };
      } catch (err) {
        logger.warn(`[SettlementLayerRouter] Payout via ${providerId} failed: ${err.message}. Triggering failover...`);
        lastError = err;
      }
    }

    throw new Error(`SETTLEMENT_FAILOVER_EXHAUSTED: All providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Fetch aggregated custody balances across all registered providers
   */
  async getAggregatedCustodyBalances() {
    const providerIds = providerRegistry.getRegisteredProviderIds();
    const allBalances = [];

    for (const id of providerIds) {
      try {
        const provider = providerRegistry.getProvider(id);
        const balances = await provider.getCustodyBalances();
        allBalances.push(...balances);
      } catch (err) {
        logger.error(`[SettlementLayerRouter] Failed to fetch custody balances for ${id}: ${err.message}`);
      }
    }

    return allBalances;
  }
}

module.exports = new SettlementLayerRouter();
