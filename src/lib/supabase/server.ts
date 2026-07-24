// ============================================================================
// Supabase Server Client
// ============================================================================
// Two client factories:
// 1. createServiceClient() — uses the SERVICE_ROLE_KEY to bypass RLS.
//    Used for all backend write operations (wallet, ledger, audit).
// 2. createRouteClient(request) — extracts the user's JWT from the request.
//    Used to identify the authenticated user in API routes.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serviceClient: SupabaseClient | null = null;

/**
 * Creates a Supabase client with the service role key.
 * This client bypasses Row Level Security and should ONLY be used server-side.
 *
 * Uses a singleton pattern — the same client is returned on subsequent calls.
 */
export function createServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  serviceClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serviceClient;
}

/**
 * Creates a Supabase client scoped to a specific user's JWT.
 * Extracts the access token from the Authorization header.
 *
 * This client DOES respect RLS and only returns data the user is allowed to see.
 */
export function createRouteClient(request: Request): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  return createClient(url, anonKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
