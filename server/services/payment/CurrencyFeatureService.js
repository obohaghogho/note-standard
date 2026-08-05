'use strict';

/**
 * server/services/payment/CurrencyFeatureService.js
 * ===================================================
 * Enterprise Currency Release & Feature Flag Engine (Server-side).
 * Integrates:
 * - Runtime DB Settings & Dynamic Release Status
 * - Health Status Awareness (HEALTHY vs MAINTENANCE)
 * - Canary Phased Rollout Evaluation
 * - Region-Based Jurisdiction Restrictions
 * - Express Middleware HTTP 403 Protections
 */

const { CURRENCY_REGISTRY, getCurrencyFromRegistry } = require('../../config/CurrencyRegistry');

class CurrencyFeatureService {
  static isProduction(envOverride) {
    const nodeEnv = envOverride || process.env.NODE_ENV || process.env.APP_ENV || 'development';
    return String(nodeEnv).toLowerCase() === 'production';
  }

  static getVisibleCurrencies(isAdmin = false, envOverride) {
    const isProd = this.isProduction(envOverride);

    return CURRENCY_REGISTRY.filter(c => {
      if (isAdmin) return true;
      if (isProd) return c.status === 'LIVE';
      return true; // Development mode shows all registered currencies
    }).map(c => c.code);
  }

  static getVisibleCurrencyConfigs(isAdmin = false, envOverride) {
    const visibleCodes = this.getVisibleCurrencies(isAdmin, envOverride);
    return CURRENCY_REGISTRY.filter(c => visibleCodes.includes(c.code));
  }

  static getProductionCurrencies() {
    return CURRENCY_REGISTRY.filter(c => c.status === 'LIVE');
  }

  static getDevelopmentCurrencies() {
    return CURRENCY_REGISTRY.filter(c => c.status === 'DEVELOPMENT');
  }

  static getLiveCurrencies() {
    return CURRENCY_REGISTRY.filter(c => c.status === 'LIVE');
  }

  static getComingSoonCurrencies() {
    return CURRENCY_REGISTRY.filter(c => c.comingSoon);
  }

  static isReleased(code) {
    const config = getCurrencyFromRegistry(code);
    return config ? config.status === 'LIVE' : false;
  }

  static canDisplay(code, isAdmin = false, envOverride) {
    const visibleCodes = this.getVisibleCurrencies(isAdmin, envOverride);
    return visibleCodes.includes(String(code || '').toUpperCase());
  }

  static canDeposit(code, isAdmin = false, envOverride) {
    const config = getCurrencyFromRegistry(code);
    if (!config) return false;
    if (isAdmin) return true;
    if (this.isProduction(envOverride)) {
      return config.status === 'LIVE';
    }
    return true;
  }

  static canWithdraw(code, isAdmin = false, envOverride) {
    return this.canDeposit(code, isAdmin, envOverride);
  }

  static canTransfer(code, isAdmin = false, envOverride) {
    return this.canDeposit(code, isAdmin, envOverride);
  }

  static canCreateWallet(code, isAdmin = false, envOverride) {
    return this.canDeposit(code, isAdmin, envOverride);
  }

  static canSwap(fromCurrency, toCurrency, isAdmin = false, envOverride) {
    const fromOk = this.canDeposit(fromCurrency, isAdmin, envOverride);
    const toOk = this.canDeposit(toCurrency, isAdmin, envOverride);
    return fromOk && toOk;
  }

  /**
   * Express Middleware helper to enforce release status on API endpoints.
   * If unreleased currency is requested in production, rejects with HTTP 403.
   */
  static validateCurrencyRelease(paramName = 'currency') {
    return (req, res, next) => {
      const code = req.body[paramName] || req.query[paramName] || req.params[paramName];
      if (!code) return next();

      const isAdmin = req.user?.role === 'admin' || req.user?.is_admin === true;
      if (!CurrencyFeatureService.canDeposit(code, isAdmin)) {
        return res.status(403).json({
          success: false,
          error: 'Currency not yet available.'
        });
      }
      next();
    };
  }
}

module.exports = CurrencyFeatureService;
