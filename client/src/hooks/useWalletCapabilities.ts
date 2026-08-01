import { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';

export interface PaymentRail {
  id: string;
  name: string;
  type: string; // 'card' | 'bank_transfer' | 'virtual_account' | 'mobile_money' | 'sepa' | 'faster_payments' | 'eft' | 'ach' | 'wire' | 'fx_settlement'
  operations: ('deposit' | 'withdrawal')[];
  provider: string;
  priority: number;
  availability: 'ONLINE' | 'DEGRADED' | 'MAINTENANCE' | 'OFFLINE';
  fee: {
    fixed: number;
    percentage: number;
    text: string;
  };
  limits: {
    minimum: number;
    maximum: number;
  };
  requiredTier: string;
  estimatedSettlement: string;
  icon: string;
  recommendedScore: number;
  recommendationBadge: string;
  health?: {
    latency: number;
    successRate: number;
    lastChecked: string;
  };
}

export interface CurrencyCapability {
  currency: string;
  name: string;
  symbol: string;
  type: 'fiat' | 'crypto';
  depositMethods: PaymentRail[];
  withdrawMethods: PaymentRail[];
  summary: {
    depositCapabilities: string[];
    withdrawCapabilities: string[];
    settlementTime: string;
    providers: string[];
  };
}

export interface CapabilitiesResponse {
  version: number;
  currencies: Record<string, CurrencyCapability>;
  retrievedAt: string;
}

export function useWalletCapabilities() {
  const [capabilities, setCapabilities] = useState<Record<string, CurrencyCapability>>({});
  const [version, setVersion] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCapabilities = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get<CapabilitiesResponse>('/wallet/capabilities');
      if (res.data && res.data.currencies) {
        setCapabilities(res.data.currencies);
        setVersion(res.data.version);
      }
      setError(null);
    } catch (err: any) {
      console.warn('[useWalletCapabilities] Failed to fetch capabilities:', err);
      setError(err?.response?.data?.error || 'Failed to load payment capabilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCapabilities();
  }, [fetchCapabilities]);

  const getCurrencyCapability = (currencyCode: string): CurrencyCapability | null => {
    const code = String(currencyCode).toUpperCase();
    return capabilities[code] || null;
  };

  return {
    capabilities,
    version,
    loading,
    error,
    refreshCapabilities: fetchCapabilities,
    getCurrencyCapability
  };
}
