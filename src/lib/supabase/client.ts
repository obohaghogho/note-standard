// ============================================================================
// Supabase Browser Client
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Creates a Supabase client for browser-side usage.
 * Uses the anonymous key and respects RLS policies.
 *
 * Singleton — returns the same client on subsequent calls.
 */
export function createBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  browserClient = createClient(url, key);
  return browserClient;
}
