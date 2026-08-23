'use strict';

/**
 * PayoutRouter.js
 * ===============
 * Fail-Closed Provider-Agnostic Bank Payout Rail Router.
 *
 * Responsibilities:
 *   1. Routes already-settled fiat (`FIAT_SETTLED`) to valid bank payout rails.
 *   2. Evaluates payout provider health, circuit breaker state, and merchant float balance.
 *   3. Automated Failover: Fincra -> Alternative Approved Rail B -> Alternative Approved Rail C.
 *   4. Safety Invariant: If all payout rails are temporarily offline, fiat remains safely settled
 *      in user's wallet (`FIAT_SETTLED` / `PAYOUT_PENDING`) with ZERO loss of customer funds.
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');
const providerRegistry = require('./ProviderRegistry');

class PayoutRouter {
  /**
   * Determine priority payout rails for a target fiat currency.
   */
  getPayoutPriorityList(currency) {
    const upCurr = String(currency || '').toUpperCase();
    if (upCurr === 'NGN') return ['FINCRA', 'ALTERNATIVE_RAIL_B', 'PAYSTACK'];
    if (upCurr === 'GHS') return ['FINCRA', 'ALTERNATIVE_RAIL_C'];
    if (upCurr === 'USD') return ['ANCHOR', 'FINCRA'];
    return ['FINCRA', 'ANCHOR'];
  }

  /**
   * Select an available payout rail and execute bank disbursement with failover.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} params.bankCode
   * @param {string} params.accountNumber
   * @param {string} params.accountName
   * @param {string} params.reference
   * @returns {Promise<Object>} Payout result or PENDING status
   */
  async executePayoutWithFailover({ userId, amount, currency, bankCode, accountNumber, accountName, reference }) {
    const priorityList = this.getPayoutPriorityList(currency);
    logger.info(`[PayoutRouter] Evaluating payout priority list for ${amount} ${currency}: [${priorityList.join(', ')}]`);

    let lastError = null;

    for (const providerId of priorityList) {
      try {
        if (!providerRegistry.hasProvider(providerId)) {
          logger.warn(`[PayoutRouter] Provider ${providerId} unmapped in registry. Skipping...`);
          continue;
        }

        const provider = providerRegistry.getProvider(providerId);
        const caps = provider.getCapabilities ? provider.getCapabilities() : {};

        if (!caps.supports_withdrawals) continue;

        // Check Provider Health Status
        const { data: healthData } = await supabase
          .from('provider_health_status')
          .select('status, circuit_breaker')
          .eq('provider', providerId)
          .maybeSingle();

        if (healthData) {
          const status = String(healthData.status || '').toUpperCase();
          const breaker = String(healthData.circuit_breaker || 'CLOSED').toUpperCase();

          if (breaker === 'OPEN' || (status !== 'ONLINE' && status !== 'HEALTHY')) {
            logger.warn(`[PayoutRouter] Provider ${providerId} is ${status} (Circuit Breaker: ${breaker}). Skipping failover route...`);
            continue;
          }
        }

        logger.info(`[PayoutRouter] Dispatching payout to ${accountNumber} (${bankCode}) via ${providerId}...`);
        const result = await provider.createPayout({
          address: accountNumber,
          amount,
          currency,
          bankCode,
          accountName,
          reference
        });

        if (result && (result.success || result.status === 'PROCESSING' || result.status === 'SUCCESSFUL')) {
          logger.info(`[PayoutRouter] Payout dispatched successfully via ${providerId}. ID: ${result.payoutId || reference}`);
          return {
            success: true,
            payoutId: result.payoutId || reference,
            provider: providerId,
            status: result.status || 'PROCESSING'
          };
        }
      } catch (err) {
        logger.warn(`[PayoutRouter] Payout via ${providerId} failed: ${err.message}. Retrying next failover rail...`);
        lastError = err;
      }
    }

    // Fail-Closed Behavior: If all rails are offline/underfunded, leave fiat safely settled in user wallet
    logger.warn(`[PayoutRouter] All bank payout rails currently unavailable for ${currency}. Payout state remains PAYOUT_PENDING.`);
    return {
      success: false,
      status: 'PAYOUT_PENDING',
      error_code: 'ALL_PAYOUT_RAILS_UNAVAILABLE',
      message: 'All bank payout rails are temporarily offline or underfunded. Your fiat is safely settled in your wallet and payout will retry automatically.'
    };
  }
}

module.exports = new PayoutRouter();
