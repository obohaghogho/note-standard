/**
 * shared/config/ProviderCapabilityRegistry.ts
 * ============================================
 * Enterprise Provider Capability Registry.
 * Single source of truth for querying provider capabilities across UI and API layers.
 */

export interface ProviderCapability {
  provider: string;
  name: string;
  version: string;
  supportedCurrencies: string[];
  features: {
    depositBankTransfer: boolean;
    withdrawBankTransfer: boolean;
    virtualAccount: boolean;
    cards: boolean;
    ach: boolean;
    wire: boolean;
    swift: boolean;
    fx: boolean;
    p2p: boolean;
    webhook: boolean;
    bulkTransfer: boolean;
  };
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability> = {
  FINCRA: {
    provider: 'FINCRA',
    name: 'Fincra NGN Virtual Accounts',
    version: 'v1',
    supportedCurrencies: ['NGN'],
    features: {
      depositBankTransfer: true,
      withdrawBankTransfer: true,
      virtualAccount: true,
      cards: true,
      ach: false,
      wire: false,
      swift: false,
      fx: false,
      p2p: true,
      webhook: true,
      bulkTransfer: true
    }
  },
  GREY: {
    provider: 'GREY',
    name: 'Grey Lead Bank USD Account',
    version: 'v1',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    features: {
      depositBankTransfer: true,
      withdrawBankTransfer: false,
      virtualAccount: true,
      cards: false,
      ach: true,
      wire: true,
      swift: false,
      fx: true,
      p2p: true,
      webhook: true,
      bulkTransfer: false
    }
  },
  ANCHOR: {
    provider: 'ANCHOR',
    name: 'Anchor Banking BaaS (Future)',
    version: 'v1',
    supportedCurrencies: ['NGN', 'USD'],
    features: {
      depositBankTransfer: true,
      withdrawBankTransfer: true,
      virtualAccount: true,
      cards: true,
      ach: false,
      wire: false,
      swift: false,
      fx: false,
      p2p: true,
      webhook: true,
      bulkTransfer: true
    }
  }
};

export const getProviderCapabilities = (providerId: string): ProviderCapability | undefined => {
  return PROVIDER_CAPABILITIES[String(providerId).toUpperCase()];
};

export const isFeatureSupportedByProvider = (providerId: string, featureKey: keyof ProviderCapability['features']): boolean => {
  const cap = getProviderCapabilities(providerId);
  return cap ? Boolean(cap.features[featureKey]) : false;
};
