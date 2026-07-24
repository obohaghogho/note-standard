/**
 * GatewayRouter.js
 * ================
 * Dynamic gateway selection engine.
 * Scores available providers against a multi-factor algorithm
 * and selects the best adapter for a given payment context.
 * Automatically fails over to backup adapters on health degradation.
 *
 * Scoring:
 *   +50  Native currency support (merchant-account level)
 *   +20  Merchant account enabled
 *   +20  Gateway health (HEALTHY = +20, DEGRADED = +5, DOWN = -999)
 *   +10  Fee efficiency score
 *
 * NoteStandard Financial Platform v4
 */

const logger = require('../../utils/logger');
const { PAYMENT_PROVIDER_CAPABILITIES, supportsCurrency, supportsMethod } = require('../../config/providerCapabilities');
const { isSupportedCryptoCurrency } = require('../../config/paymentCurrencies');

// Health status store (updated by HealthMonitor, defaults to HEALTHY)
const _healthStore = new Map();

// Lazy-load adapters (avoids circular deps at module load time)
function _loadAdapter(name) {
  const map = {
    paystack:     () => require('./adapters/PaystackAdapter'),
    fincra:       () => require('./adapters/FincraAdapter'),
    grey:         () => require('./adapters/GreyAdapter'),
    anchor:       () => require('./adapters/AnchorAdapter'),
    nowpayments:  () => require('./adapters/NowPaymentsAdapter'),
  };
  const loader = map[name];
  if (!loader) throw new Error(`[GatewayRouter] Unknown adapter: ${name}`);
  return loader();
}

class GatewayRouter {
  /**
   * Selects and returns the highest-scoring available gateway adapter.
   *
   * @param {Object} params
   * @param {string} params.currency   - Requested payment currency (e.g. 'JPY', 'EUR')
   * @param {string} [params.method]   - 'card' | 'bank_transfer' | 'dva' | 'subscription' | 'crypto'
   * @param {string} [params.region]   - ISO 3166 country code of user
   * @returns {{ adapter: Object, providerName: string, isNative: boolean, score: number }}
   */
  selectBestGateway({ currency, method = 'card', region }) {
    const up = String(currency).toUpperCase();

    // Crypto shortcut
    if (isSupportedCryptoCurrency(up) || method === 'crypto') {
      const adapter = _loadAdapter('nowpayments');
      return { adapter, providerName: 'nowpayments', isNative: true, score: 70 };
    }

    const candidates = [];

    for (const [name, caps] of Object.entries(PAYMENT_PROVIDER_CAPABILITIES)) {
      if (!caps.merchantEnabled) continue;
      if (!supportsMethod(name, method)) continue;

      const health = this.getHealth(name);
      if (health === 'DOWN') continue;

      const nativeSupport = supportsCurrency(name, up);
      const score =
        (nativeSupport ? 50 : 0) +
        (caps.merchantEnabled ? 20 : 0) +
        (health === 'HEALTHY' ? 20 : health === 'DEGRADED' ? 5 : 0) +
        (caps.feeEfficiencyScore || 0);

      candidates.push({ name, caps, score, isNative: nativeSupport });
    }

    if (candidates.length === 0) {
      throw new Error(`[GatewayRouter] No available gateway for ${up} / ${method}. Check provider health and capabilities.`);
    }

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    logger.info(`[GatewayRouter] Selected: ${best.name} | score=${best.score} | native=${best.isNative} | ${up}/${method}`);

    const adapter = _loadAdapter(best.name);
    return { adapter, providerName: best.name, isNative: best.isNative, score: best.score };
  }

  /**
   * Returns whether native currency processing is available for a given currency + method.
   * If false, the caller should apply FX conversion first.
   */
  isNativeSupported(currency, method = 'card') {
    try {
      const { isNative } = this.selectBestGateway({ currency, method });
      return isNative;
    } catch {
      return false;
    }
  }

  /**
   * Returns all compatible providers for a currency + method (for admin display).
   */
  listCompatible(currency, method = 'card') {
    const up = String(currency).toUpperCase();
    return Object.entries(PAYMENT_PROVIDER_CAPABILITIES)
      .filter(([name, caps]) => caps.merchantEnabled && supportsCurrency(name, up) && supportsMethod(name, method))
      .map(([name, caps]) => ({ name, health: this.getHealth(name), feeScore: caps.feeEfficiencyScore }));
  }

  // ─── Health Management ─────────────────────────────────────────────────

  /** @param {'HEALTHY'|'DEGRADED'|'DOWN'} status */
  setHealth(providerName, status) {
    logger.info(`[GatewayRouter] Health update: ${providerName} → ${status}`);
    _healthStore.set(providerName.toLowerCase(), status);
  }

  getHealth(providerName) {
    return _healthStore.get(providerName.toLowerCase()) || 'HEALTHY';
  }

  getAllHealth() {
    const result = {};
    for (const [name] of Object.entries(PAYMENT_PROVIDER_CAPABILITIES)) {
      result[name] = this.getHealth(name);
    }
    return result;
  }
}

module.exports = new GatewayRouter();
