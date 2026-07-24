// ============================================================================
// Provider Registry — Centralized provider selection
// ============================================================================

import type { PaymentProvider } from './interfaces/payment-provider.interface';
import type { CryptoProvider } from './interfaces/crypto-provider.interface';
import type { PayoutProvider } from './interfaces/payout-provider.interface';
import type { ProviderInfo } from './interfaces/types';
import type { ProviderHealthMonitor } from './health-monitor';
import { PaymentMethod } from '@/types';
import { ProviderNotFoundError, ProviderUnhealthyError } from '@/lib/utils/errors';

type AnyProvider = PaymentProvider | CryptoProvider | PayoutProvider;

export class ProviderRegistry {
  private paymentProviders = new Map<string, PaymentProvider>();
  private cryptoProviders = new Map<string, CryptoProvider>();
  private payoutProviders = new Map<string, PayoutProvider>();

  constructor(private healthMonitor?: ProviderHealthMonitor) {}

  /** Register a payment provider */
  registerPaymentProvider(provider: PaymentProvider): void {
    this.paymentProviders.set(provider.name, provider);
  }

  /** Register a crypto provider */
  registerCryptoProvider(provider: CryptoProvider): void {
    this.cryptoProviders.set(provider.name, provider);
  }

  /** Register a payout provider */
  registerPayoutProvider(provider: PayoutProvider): void {
    this.payoutProviders.set(provider.name, provider);
  }

  /**
   * Select a payment provider based on currency and optional method.
   * Checks provider health before returning.
   */
  async getPaymentProvider(
    currency: string,
    method?: PaymentMethod,
  ): Promise<PaymentProvider> {
    const candidates = Array.from(this.paymentProviders.values()).filter(
      (p) => {
        const supportsCurrency = p.supportedCurrencies.includes(currency);
        const supportsMethod = !method || p.supportedMethods.includes(method);
        return supportsCurrency && supportsMethod;
      },
    );

    if (candidates.length === 0) {
      throw new ProviderNotFoundError(
        `currency=${currency}${method ? `, method=${method}` : ''}`,
      );
    }

    // Pick the first healthy provider
    for (const provider of candidates) {
      if (this.healthMonitor) {
        const isHealthy = await this.healthMonitor.isHealthy(provider.name);
        if (!isHealthy) continue;
      }
      return provider;
    }

    throw new ProviderUnhealthyError(candidates[0].name);
  }

  /** Select a crypto provider for a given asset */
  async getCryptoProvider(asset: string): Promise<CryptoProvider> {
    const candidates = Array.from(this.cryptoProviders.values()).filter((p) =>
      p.supportedAssets.includes(asset),
    );

    if (candidates.length === 0) {
      throw new ProviderNotFoundError(`crypto asset=${asset}`);
    }

    for (const provider of candidates) {
      if (this.healthMonitor) {
        const isHealthy = await this.healthMonitor.isHealthy(provider.name);
        if (!isHealthy) continue;
      }
      return provider;
    }

    throw new ProviderUnhealthyError(candidates[0].name);
  }

  /** Select a payout provider for a given currency */
  async getPayoutProvider(currency: string): Promise<PayoutProvider> {
    const candidates = Array.from(this.payoutProviders.values()).filter((p) =>
      p.supportedCurrencies.includes(currency),
    );

    if (candidates.length === 0) {
      throw new ProviderNotFoundError(`payout currency=${currency}`);
    }

    for (const provider of candidates) {
      if (this.healthMonitor) {
        const isHealthy = await this.healthMonitor.isHealthy(provider.name);
        if (!isHealthy) continue;
      }
      return provider;
    }

    throw new ProviderUnhealthyError(candidates[0].name);
  }

  /** Get any provider by name (for webhook dispatch) */
  getProviderByName(name: string): AnyProvider {
    const provider =
      this.paymentProviders.get(name) ||
      this.cryptoProviders.get(name) ||
      this.payoutProviders.get(name);

    if (!provider) {
      throw new ProviderNotFoundError(`name=${name}`);
    }

    return provider;
  }

  /** List all registered providers with health status */
  async listProviders(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = [];

    for (const [, p] of this.paymentProviders) {
      const isHealthy = this.healthMonitor
        ? await this.healthMonitor.isHealthy(p.name)
        : true;
      providers.push({
        name: p.name,
        type: 'payment',
        supportedCurrencies: p.supportedCurrencies,
        isHealthy,
      });
    }

    for (const [, p] of this.cryptoProviders) {
      const isHealthy = this.healthMonitor
        ? await this.healthMonitor.isHealthy(p.name)
        : true;
      providers.push({
        name: p.name,
        type: 'crypto',
        supportedCurrencies: p.supportedAssets,
        isHealthy,
      });
    }

    for (const [, p] of this.payoutProviders) {
      const isHealthy = this.healthMonitor
        ? await this.healthMonitor.isHealthy(p.name)
        : true;
      providers.push({
        name: p.name,
        type: 'payout',
        supportedCurrencies: p.supportedCurrencies,
        isHealthy,
      });
    }

    return providers;
  }
}
