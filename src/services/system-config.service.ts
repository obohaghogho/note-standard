// ============================================================================
// System Configuration Service
// ============================================================================
// Reads/writes system-wide configuration values from the `system_config`
// table with a short-lived in-memory cache (default 60 s).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SystemConfig } from '@/types';

// ---------------------------------------------------------------------------
// Internal cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: unknown;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service for reading and writing system-wide configuration values.
 *
 * Values are cached in-memory for {@link cacheTtlMs} milliseconds before
 * being re-fetched from the database.
 */
export class SystemConfigService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs: number = 60_000; // 1 minute
  private readonly supabase: SupabaseClient;

  /**
   * @param supabase - A Supabase client with service-role privileges.
   */
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // -----------------------------------------------------------------------
  // Typed accessors
  // -----------------------------------------------------------------------

  /**
   * Retrieve a configuration value by key, casting to the expected type.
   *
   * Returns `undefined` when the key does not exist.
   *
   * @param key - The configuration key.
   */
  async get<T>(key: string): Promise<T | undefined> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.value as T;
    }

    const { data, error } = await this.supabase
      .from('system_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error(`[SystemConfigService] Failed to fetch key "${key}":`, error.message);
      // Fall back to stale cache if available
      if (cached) return cached.value as T;
      return undefined;
    }

    if (!data) return undefined;

    this.cache.set(key, { value: data.value, fetchedAt: Date.now() });
    return data.value as T;
  }

  /**
   * Retrieve a configuration value and parse it as a number.
   *
   * @throws {Error} If the value cannot be parsed as a number.
   */
  async getNumber(key: string): Promise<number> {
    const raw = await this.get<unknown>(key);
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`[SystemConfigService] Value for "${key}" is not a valid number: ${String(raw)}`);
    }
    return parsed;
  }

  /**
   * Retrieve a configuration value and coerce it to a boolean.
   *
   * Truthy strings ("true", "1", "yes") → `true`; everything else → `false`.
   */
  async getBoolean(key: string): Promise<boolean> {
    const raw = await this.get<unknown>(key);
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw === 'string') {
      return ['true', '1', 'yes'].includes(raw.toLowerCase());
    }
    return false;
  }

  /**
   * Retrieve a configuration value as a string.
   *
   * Returns an empty string when the key does not exist.
   */
  async getString(key: string): Promise<string> {
    const raw = await this.get<unknown>(key);
    return raw === undefined || raw === null ? '' : String(raw);
  }

  // -----------------------------------------------------------------------
  // Writes
  // -----------------------------------------------------------------------

  /**
   * Upsert a configuration value and invalidate its cache entry.
   *
   * @param key     - The configuration key.
   * @param value   - The value to store (will be JSON-serialised by Supabase).
   * @param actorId - The id of the user or system actor performing the write.
   */
  async set(key: string, value: unknown, actorId: string): Promise<void> {
    const { error } = await this.supabase
      .from('system_config')
      .upsert(
        {
          key,
          value,
          updated_by: actorId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (error) {
      throw new Error(
        `[SystemConfigService] Failed to set key "${key}": ${error.message}`,
      );
    }

    // Invalidate so the next read picks up the new value
    this.cache.delete(key);
  }

  // -----------------------------------------------------------------------
  // Bulk read
  // -----------------------------------------------------------------------

  /**
   * Fetch all configuration entries belonging to a category.
   *
   * Results are **not** cached individually — use `get()` for
   * per-key caching.
   *
   * @param category - The category to filter by (e.g. "deposit_limits").
   */
  async getByCategory(category: string): Promise<SystemConfig[]> {
    const { data, error } = await this.supabase
      .from('system_config')
      .select('*')
      .eq('category', category);

    if (error) {
      throw new Error(
        `[SystemConfigService] Failed to fetch category "${category}": ${error.message}`,
      );
    }

    return (data ?? []) as SystemConfig[];
  }

  // -----------------------------------------------------------------------
  // Cache management
  // -----------------------------------------------------------------------

  /**
   * Clear the entire in-memory cache.
   * The next call to `get()` will hit the database.
   */
  invalidateCache(): void {
    this.cache.clear();
  }
}
