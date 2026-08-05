/**
 * shared/services/CurrencyFeatureService.ts
 * ===========================================
 * Feature Flag & Release Management Service for NoteStandard Fiat Currencies.
 * Controls environment-based currency visibility & action execution permissions.
 */

import { CURRENCY_REGISTRY, CurrencyConfig, getCurrencyFromRegistry } from '../config/CurrencyRegistry';

export class CurrencyFeatureService {
  /**
   * Determine current environment: 'production' vs 'development'
   */
  private static isProduction(envOverride?: string): boolean {
    if (envOverride) return String(envOverride).toLowerCase() === 'production';
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local')) {
        return true;
      }
    }
    const nodeEnv = (typeof process !== 'undefined' && process.env ? process.env.NODE_ENV || process.env.APP_ENV : 'development');
    return String(nodeEnv).toLowerCase() === 'production';
  }

  /**
   * Get visible currencies for current environment & user role
   * In Production: Returns ['NGN', 'USD'] (unless isAdmin)
   * In Development / Admin: Returns all registered currencies
   */
  public static getVisibleCurrencies(isAdmin: boolean = false, envOverride?: string): string[] {
    const isProd = this.isProduction(envOverride);

    return CURRENCY_REGISTRY.filter(c => {
      if (isAdmin) return true;
      if (isProd) return c.status === 'LIVE';
      return true; // Development mode shows all currencies
    }).map(c => c.code);
  }

  public static getVisibleCurrencyConfigs(isAdmin: boolean = false, envOverride?: string): CurrencyConfig[] {
    const visibleCodes = this.getVisibleCurrencies(isAdmin, envOverride);
    return CURRENCY_REGISTRY.filter(c => visibleCodes.includes(c.code));
  }

  public static getProductionCurrencies(): CurrencyConfig[] {
    return CURRENCY_REGISTRY.filter(c => c.status === 'LIVE');
  }

  public static getDevelopmentCurrencies(): CurrencyConfig[] {
    return CURRENCY_REGISTRY.filter(c => c.status === 'DEVELOPMENT');
  }

  public static getLiveCurrencies(): CurrencyConfig[] {
    return CURRENCY_REGISTRY.filter(c => c.status === 'LIVE');
  }

  public static getComingSoonCurrencies(): CurrencyConfig[] {
    return CURRENCY_REGISTRY.filter(c => c.comingSoon);
  }

  public static isReleased(code: string): boolean {
    const config = getCurrencyFromRegistry(code);
    return config ? config.status === 'LIVE' : false;
  }

  public static canDisplay(code: string, isAdmin: boolean = false, envOverride?: string): boolean {
    const visibleCodes = this.getVisibleCurrencies(isAdmin, envOverride);
    return visibleCodes.includes(String(code).toUpperCase());
  }

  public static canDeposit(code: string, isAdmin: boolean = false, envOverride?: string): boolean {
    const config = getCurrencyFromRegistry(code);
    if (!config) return false;
    if (isAdmin) return true;
    if (this.isProduction(envOverride)) {
      return config.status === 'LIVE';
    }
    return true;
  }

  public static canWithdraw(code: string, isAdmin: boolean = false, envOverride?: string): boolean {
    return this.canDeposit(code, isAdmin, envOverride);
  }

  public static canTransfer(code: string, isAdmin: boolean = false, envOverride?: string): boolean {
    return this.canDeposit(code, isAdmin, envOverride);
  }

  public static canCreateWallet(code: string, isAdmin: boolean = false, envOverride?: string): boolean {
    return this.canDeposit(code, isAdmin, envOverride);
  }

  /**
   * Validate if a swap pair (e.g., NGN -> USD) is allowed in current environment
   */
  public static canSwap(fromCurrency: string, toCurrency: string, isAdmin: boolean = false, envOverride?: string): boolean {
    const fromOk = this.canDeposit(fromCurrency, isAdmin, envOverride);
    const toOk = this.canDeposit(toCurrency, isAdmin, envOverride);
    return fromOk && toOk;
  }

  public static getCurrencyStatusBadge(code: string): { status: string; label: string; badge: string; colorClass: string } {
    const config = getCurrencyFromRegistry(code);
    if (!config) {
      return { status: 'UNKNOWN', label: 'Unknown', badge: '⚪ Unknown', colorClass: 'bg-gray-500/20 text-gray-400' };
    }

    if (config.status === 'LIVE') {
      return { status: 'LIVE', label: 'Live', badge: '🟢 Live', colorClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
    if (config.status === 'DEVELOPMENT') {
      return { status: 'DEVELOPMENT', label: 'Development', badge: '🟡 Development', colorClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    }
    return { status: 'COMING_SOON', label: 'Coming Soon', badge: '⚪ Coming Soon', colorClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  }
}
