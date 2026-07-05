export interface PaymentCapability {
  enabled: boolean;
  verifiedDomains: string[];
  requiresSafari: boolean;
  requiresHttps: boolean;
}

export const paymentCapabilities: Record<string, PaymentCapability> = {
  APPLE_PAY: {
    enabled: true,
    verifiedDomains: ['notestandard.com'],
    requiresSafari: true,
    requiresHttps: true
  }
};
