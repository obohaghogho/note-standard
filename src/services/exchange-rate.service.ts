// ============================================================================
// Exchange Rate Service
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExchangeRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: string;
  fetchedAt: string;
  expiresAt: string;
}

export class ExchangeRateService {
  private cache = new Map<string, { rate: ExchangeRate; fetchedAt: number }>();
  private cacheTtlMs = 300_000; // 5 minutes

  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get the exchange rate between two currencies.
   * Checks cache first, then database, then returns null if not found.
   */
  async getRate(
    baseCurrency: string,
    quoteCurrency: string,
  ): Promise<ExchangeRate | null> {
    const cacheKey = `${baseCurrency}/${quoteCurrency}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.rate;
    }

    // Check database
    const { data, error } = await this.supabase
      .from('exchange_rates')
      .select('*')
      .eq('base_currency', baseCurrency)
      .eq('quote_currency', quoteCurrency)
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const rate: ExchangeRate = {
      baseCurrency: data.base_currency,
      quoteCurrency: data.quote_currency,
      rate: parseFloat(data.rate),
      source: data.source,
      fetchedAt: data.fetched_at,
      expiresAt: data.expires_at,
    };

    this.cache.set(cacheKey, { rate, fetchedAt: Date.now() });
    return rate;
  }

  /**
   * Convert an amount from one currency to another.
   * Returns the converted amount or null if no rate is available.
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number | null> {
    if (fromCurrency === toCurrency) return amount;

    const rate = await this.getRate(fromCurrency, toCurrency);
    if (!rate) return null;

    return Math.round(amount * rate.rate);
  }

  /**
   * Store a new exchange rate (e.g., fetched from an external API).
   */
  async storeRate(
    baseCurrency: string,
    quoteCurrency: string,
    rate: number,
    source: string,
    ttlSeconds = 300,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const { error } = await this.supabase
      .from('exchange_rates')
      .upsert(
        {
          base_currency: baseCurrency,
          quote_currency: quoteCurrency,
          rate,
          source,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'base_currency,quote_currency,source' },
      );

    if (error) {
      console.error('[ExchangeRate] Failed to store rate:', error.message);
    }

    // Invalidate cache
    this.cache.delete(`${baseCurrency}/${quoteCurrency}`);
  }

  /**
   * Get all current exchange rates.
   */
  async getAllRates(): Promise<ExchangeRate[]> {
    const { data, error } = await this.supabase
      .from('exchange_rates')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch rates: ${error.message}`);

    return (data ?? []).map((row) => ({
      baseCurrency: row.base_currency,
      quoteCurrency: row.quote_currency,
      rate: parseFloat(row.rate),
      source: row.source,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    }));
  }

  /** Invalidate the cache */
  invalidateCache(): void {
    this.cache.clear();
  }
}
