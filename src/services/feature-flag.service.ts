// ============================================================================
// Feature Flag Service
// ============================================================================
// Evaluates feature flags stored in the `feature_flags` table.
// Supports:
//   • on/off toggle
//   • tier-based allow-list
//   • deterministic percentage rollout (FNV-1a hash of flag+userId)
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureFlag } from '@/types';
import { FeatureDisabledError } from '@/lib/utils/errors';

// ---------------------------------------------------------------------------
// Internal cache entry
// ---------------------------------------------------------------------------

interface FlagCacheEntry {
  flag: FeatureFlag;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Deterministic hash helper (FNV-1a 32-bit)
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash.
 *
 * Used to deterministically assign a user to a rollout bucket so the same
 * user always gets the same result for a given flag, regardless of when or
 * where the check runs.
 *
 * @returns A value in the range [0, 99].
 */
function deterministicBucket(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return Math.abs(hash) % 100;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service for evaluating feature flags with support for tier-based gating
 * and deterministic percentage rollouts.
 *
 * Flags are cached in-memory for {@link cacheTtlMs} milliseconds.
 */
export class FeatureFlagService {
  private cache: Map<string, FlagCacheEntry> = new Map();
  private readonly cacheTtlMs: number = 30_000; // 30 seconds
  private readonly supabase: SupabaseClient;

  /**
   * @param supabase - A Supabase client with service-role privileges.
   */
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // -----------------------------------------------------------------------
  // Core evaluation
  // -----------------------------------------------------------------------

  /**
   * Check whether a feature flag is enabled for a given user.
   *
   * Evaluation order:
   * 1. If the flag does not exist or `is_enabled` is `false` → **false**.
   * 2. If `allowed_tiers` is non-empty and `userTier` is not in it → **false**.
   * 3. If `rollout_percentage` is less than 100 and the deterministic hash
   *    of `(flagKey + userId)` falls outside the percentage → **false**.
   * 4. Otherwise → **true**.
   *
   * @param flagKey  - The feature flag key.
   * @param userTier - The authenticated user's subscription tier (optional).
   * @param userId   - The authenticated user's id (optional, needed for rollout).
   */
  async isEnabled(
    flagKey: string,
    userTier?: string,
    userId?: string,
  ): Promise<boolean> {
    const flag = await this.fetchFlag(flagKey);
    if (!flag) return false;
    if (!flag.is_enabled) return false;

    // Tier gating
    if (flag.allowed_tiers.length > 0) {
      if (!userTier || !flag.allowed_tiers.includes(userTier)) {
        return false;
      }
    }

    // Percentage rollout
    if (flag.rollout_percentage < 100) {
      if (!userId) return false;
      const bucket = deterministicBucket(`${flagKey}:${userId}`);
      if (bucket >= flag.rollout_percentage) {
        return false;
      }
    }

    return true;
  }

  /**
   * Assert that a feature flag is enabled; throw otherwise.
   *
   * Convenience wrapper for guard-clause patterns:
   * ```ts
   * await featureFlags.assertEnabled('crypto_deposits', ctx.userTier, ctx.userId);
   * ```
   *
   * @throws {FeatureDisabledError} If the flag is not enabled.
   */
  async assertEnabled(
    flagKey: string,
    userTier?: string,
    userId?: string,
  ): Promise<void> {
    const enabled = await this.isEnabled(flagKey, userTier, userId);
    if (!enabled) {
      throw new FeatureDisabledError(flagKey);
    }
  }

  // -----------------------------------------------------------------------
  // Admin mutations
  // -----------------------------------------------------------------------

  /**
   * Toggle a feature flag on or off.
   *
   * @param flagKey  - The feature flag key.
   * @param enabled  - Whether the flag should be enabled.
   * @param actorId  - The id of the admin performing the change.
   */
  async setFlag(
    flagKey: string,
    enabled: boolean,
    actorId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('feature_flags')
      .update({
        is_enabled: enabled,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('key', flagKey);

    if (error) {
      throw new Error(
        `[FeatureFlagService] Failed to set flag "${flagKey}": ${error.message}`,
      );
    }

    // Invalidate cached entry
    this.cache.delete(flagKey);
  }

  // -----------------------------------------------------------------------
  // Bulk read
  // -----------------------------------------------------------------------

  /**
   * Retrieve all feature flags.
   *
   * Results are not individually cached — use `isEnabled()` for per-flag
   * evaluation with caching.
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .order('key', { ascending: true });

    if (error) {
      throw new Error(
        `[FeatureFlagService] Failed to fetch all flags: ${error.message}`,
      );
    }

    return (data ?? []) as FeatureFlag[];
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Fetch a single flag from cache or database.
   */
  private async fetchFlag(flagKey: string): Promise<FeatureFlag | null> {
    const cached = this.cache.get(flagKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.flag;
    }

    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('key', flagKey)
      .maybeSingle();

    if (error) {
      console.error(
        `[FeatureFlagService] Failed to fetch flag "${flagKey}":`,
        error.message,
      );
      // Fall back to stale cache
      return cached?.flag ?? null;
    }

    if (!data) return null;

    const flag = data as FeatureFlag;
    this.cache.set(flagKey, { flag, fetchedAt: Date.now() });
    return flag;
  }
}
