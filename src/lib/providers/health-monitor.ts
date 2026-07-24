// ============================================================================
// Provider Health Monitor
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { ProviderHealthStatus } from '@/types';

interface HealthState {
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  lastCheckAt: number;
}

export class ProviderHealthMonitor {
  private cache = new Map<string, HealthState>();
  private cacheTtlMs = 30_000; // 30 seconds

  constructor(
    private supabase: SupabaseClient,
    private unhealthyThreshold = 5,
  ) {}

  /** Record a successful API call */
  async recordSuccess(provider: string, latencyMs: number): Promise<void> {
    const { error } = await this.supabase
      .from('provider_health')
      .upsert(
        {
          provider_name: provider,
          status: ProviderHealthStatus.HEALTHY,
          last_success_at: new Date().toISOString(),
          consecutive_failures: 0,
          avg_latency_ms: latencyMs,
          last_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider_name' },
      );

    if (error) console.error(`[HealthMonitor] Error recording success:`, error);

    this.cache.set(provider, {
      status: ProviderHealthStatus.HEALTHY,
      consecutiveFailures: 0,
      lastCheckAt: Date.now(),
    });
  }

  /** Record a failed API call */
  async recordFailure(provider: string, err: Error): Promise<void> {
    // First get current state
    const { data } = await this.supabase
      .from('provider_health')
      .select('consecutive_failures')
      .eq('provider_name', provider)
      .single();

    const currentFailures = (data?.consecutive_failures || 0) + 1;
    const newStatus: ProviderHealthStatus =
      currentFailures >= this.unhealthyThreshold ? ProviderHealthStatus.UNHEALTHY : ProviderHealthStatus.DEGRADED;

    const { error: updateError } = await this.supabase
      .from('provider_health')
      .upsert(
        {
          provider_name: provider,
          status: newStatus,
          last_failure_at: new Date().toISOString(),
          consecutive_failures: currentFailures,
          last_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { lastError: err.message },
        },
        { onConflict: 'provider_name' },
      );

    if (updateError) console.error(`[HealthMonitor] Error recording failure:`, updateError);

    this.cache.set(provider, {
      status: newStatus,
      consecutiveFailures: currentFailures,
      lastCheckAt: Date.now(),
    });
  }

  /** Check if a provider is healthy (uses cache) */
  async isHealthy(provider: string): Promise<boolean> {
    const cached = this.cache.get(provider);
    if (cached && Date.now() - cached.lastCheckAt < this.cacheTtlMs) {
      return cached.status !== ProviderHealthStatus.UNHEALTHY;
    }

    const { data } = await this.supabase
      .from('provider_health')
      .select('status, consecutive_failures')
      .eq('provider_name', provider)
      .single();

    if (!data) return true; // Unknown provider — assume healthy

    this.cache.set(provider, {
      status: data.status as ProviderHealthStatus,
      consecutiveFailures: data.consecutive_failures,
      lastCheckAt: Date.now(),
    });

    return data.status !== ProviderHealthStatus.UNHEALTHY;
  }

  /** Get full health status for a provider */
  async getStatus(provider: string): Promise<HealthState> {
    const cached = this.cache.get(provider);
    if (cached && Date.now() - cached.lastCheckAt < this.cacheTtlMs) {
      return cached;
    }

    const { data } = await this.supabase
      .from('provider_health')
      .select('*')
      .eq('provider_name', provider)
      .single();

    const state: HealthState = {
      status: (data?.status as ProviderHealthStatus) || 'healthy',
      consecutiveFailures: data?.consecutive_failures || 0,
      lastCheckAt: Date.now(),
    };

    this.cache.set(provider, state);
    return state;
  }

  /** Refresh all provider statuses from the database */
  async refreshAllStatuses(): Promise<void> {
    const { data } = await this.supabase
      .from('provider_health')
      .select('provider_name, status, consecutive_failures');

    if (data) {
      for (const row of data) {
        this.cache.set(row.provider_name, {
          status: row.status as ProviderHealthStatus,
          consecutiveFailures: row.consecutive_failures,
          lastCheckAt: Date.now(),
        });
      }
    }
  }
}
