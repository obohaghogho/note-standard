import { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import toast from "react-hot-toast";
import type { Wallet } from '@/types/wallet';
import type { Profile, Subscription } from '../types/auth';
import type { Note } from '../types/note';

// --------------------------
// Supabase Client
// --------------------------
import { supabase as supabaseClient } from './supabase';

// --------------------------
// Supabase Client
// --------------------------
export const supabase: SupabaseClient = supabaseClient;

// --------------------------
// RateLimiter per-call
// --------------------------
type RateLimiter = {
  lastCall: number;
  minDelay: number; // in ms
};

const rateLimiters: Record<string, RateLimiter> = {};
const inFlightPromises = new Map<string, Promise<any>>();

/**
 * Reset rate limiters - call on session change to avoid stale cooldowns
 */
export function resetRateLimiters(keyPrefix?: string) {
  if (keyPrefix) {
    Object.keys(rateLimiters)
      .filter(k => k.startsWith(keyPrefix))
      .forEach(k => delete rateLimiters[k]);
  } else {
    // Clear all
    Object.keys(rateLimiters).forEach(k => delete rateLimiters[k]);
  }
  inFlightPromises.clear();
  console.log('[Supabase] Rate limiters reset', keyPrefix ? `for prefix: ${keyPrefix}` : '(all)');
}

/**
 * Generic safe call wrapper with retries, timeout, and promise sharing
 */
export async function safeCall<T>(
  key: string,
  fn: () => Promise<T>,
  options: {
    minDelay?: number;
    retries?: number;
    timeout?: number;
    fallback?: T;
  } = {}
): Promise<T | null> {
  const { minDelay = 1000, retries = 3, timeout = 15000, fallback } = options;

  // 1. Check if identical request is already in flight (Promise Sharing)
  if (inFlightPromises.has(key)) {
    console.log(`[Supabase] Sharing in-flight promise for '${key}'`);
    return inFlightPromises.get(key) as Promise<T>;
  }

  // Initialize limiter
  if (!rateLimiters[key]) {
    rateLimiters[key] = { lastCall: 0, minDelay };
  }

  const now = Date.now();
  const limiter = rateLimiters[key];

  // 2. Check cooldown (Throttle)
  const timeSinceLast = now - limiter.lastCall;
  if (timeSinceLast < limiter.minDelay) {
    console.warn(`[Supabase] Throttling '${key}' (${limiter.minDelay - timeSinceLast}ms remaining)`);
    await new Promise(resolve => setTimeout(resolve, limiter.minDelay - timeSinceLast));
  }

  // Helper to determine if error is transient
  const isRetryable = (err: any) => {
    // 1. Explicitly ignore Supabase initialization/internal states if possible
    // 2. Terminal Postgrest/Auth errors
    const terminalCodes = [
      '42501', // RLS Permission Denied
      '42P17', // Recursion
      'P0001', // Raise Exception
      '23505', // Unique Violation
      '23503', // FK Violation
      '42703', // Undefined Column (Postgres 42703)
      '406',   // Not Acceptable (Schema mismatch)
      '400',   // Bad Request
      '401',   // Unauthorized
      '403',   // Forbidden
      'BGR88', // Rate limit
    ];

    const errCode = err.code?.toString();
    const errStatus = err.status?.toString();

    if (terminalCodes.includes(errCode) || terminalCodes.includes(errStatus)) return false;

    // 3. Retry on timeouts, network failures, and 5xx errors
    const isTimeout = err.message?.includes('Timeout') || err.name === 'AbortError' || err.message?.includes('abort');
    const isNetwork = !err.code && (
      err.message?.toLowerCase().includes('fetch') || 
      err.message?.toLowerCase().includes('network') ||
      err.message?.toLowerCase().includes('failed to fetch') ||
      err.message?.toLowerCase().includes('load failed') ||
      err.message?.toLowerCase().includes('connection refused')
    );
    const is5xx = err.status >= 500;

    // DO NOT retry if we are still in a "recovering" state if identifiable
    if (err.message?.includes('_recoverAndRefresh')) return false;

    return isTimeout || isNetwork || is5xx;
  };

  // 3. Execute with retries and timeout
  const executeCall = async (): Promise<T | null> => {
    let attempt = 0;
    limiter.lastCall = Date.now();

    while (attempt <= retries) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
        });

        const result = await Promise.race([fn(), timeoutPromise]);
        
        // Handle Supabase error object inside result
        if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
          throw (result as any).error;
        }

        return result;

      } catch (err: any) {
        attempt++;
        const canRetry = isRetryable(err);

        if (!canRetry || attempt > retries) {
          const tag = canRetry ? 'MAX_RETRIES' : 'TERMINAL';
          if (!navigator.onLine) {
            toast.error("You're offline. Please reconnect to continue.", { id: 'supabase-offline' });
          } else {
            console.error(`[Supabase ${tag}] '${key}' (Code: ${err.code || 'None'}):`, {
              message: err.message,
              attempt,
              status: err.status
            });
          }

          return fallback !== undefined ? fallback : null;
        }

        const backoff = 500 * Math.pow(2, attempt - 1); // Shorter backoff for start
        await new Promise(r => setTimeout(r, Math.min(backoff, 5000)));
      }
    }
    return fallback !== undefined ? fallback : null;
  };

  // Wrap in promise cache
  const resultPromise = executeCall().finally(() => {
    inFlightPromises.delete(key);
  });

  inFlightPromises.set(key, resultPromise);
  return resultPromise;
}

// --------------------------
// Safe Table Query with Fallback
// --------------------------

interface QueryResponse<T> {
  data: T | null;
  error: PostgrestError | null;
  count?: number | null;
}

/**
 * Generic helper for querying tables with automatic fallback.
 */
export async function safeTableQuery<T>(
  primaryTable: string,
  fallbackTable: string | null,
  // We use ReturnType<SupabaseClient['from']> for strict builder typing
  query: (table: ReturnType<SupabaseClient['from']>) => Promise<QueryResponse<T>>,
  defaultValue: T
): Promise<T> {
  try {
    // Try primary table
    const { data, error } = await query(supabase.from(primaryTable));
    
    if (error) {
      // Check if table doesn't exist (PostgreSQL error code 42P01)
      const isTableMissing = error.code === '42P01' || 
                            error.message?.includes('does not exist') ||
                            (error.message?.includes('relation') && error.message?.includes('does not exist'));
      
      if (isTableMissing && fallbackTable) {
        console.warn(`[Supabase] Table '${primaryTable}' not found, trying fallback '${fallbackTable}'`);
        toast(`Using fallback table: ${fallbackTable}`, { icon: '⚠️', duration: 2000 });
        
        // Try fallback table
        const { data: fallbackData, error: fallbackError } = await query(supabase.from(fallbackTable));
        
        if (fallbackError) {
          console.error(`[Supabase] Fallback table '${fallbackTable}' also failed:`, fallbackError);
          return defaultValue;
        }
        
        return (fallbackData as T) || defaultValue;
      }
      
      // Other errors or no fallback
      console.error(`[Supabase] Query error on '${primaryTable}':`, error);
      return defaultValue;
    }
    
    return (data as T) || defaultValue;
  } catch (err) {
    console.error(`[Supabase] Unexpected error querying '${primaryTable}':`, err);
    return defaultValue;
  }
}


// --------------------------
// Auth
// --------------------------
export async function safeAuth(): Promise<Session | null> {
  return safeCall<Session | null>("auth-session", async () => {
    // Use getSession for immediate check, it's faster than getUser which hits the DB
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }, { minDelay: 200, retries: 1, timeout: 3000 }); // Very fast checkout for auth
}

// --------------------------
// Profile
// --------------------------
export async function safeProfile(userId: string): Promise<Profile | null | 'ERROR'> {
  return safeCall<Profile | null | 'ERROR'>(
    "profile-" + userId,
    async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, role, bio, website")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    { fallback: 'ERROR' }
  );
}

// --------------------------
// Subscription
// --------------------------
export async function safeSubscription(userId: string): Promise<Subscription | null | 'ERROR'> {
  return safeCall<Subscription | null | 'ERROR'>(
    "subscription-" + userId,
    async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, status, plan_tier, current_period_end")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
    { fallback: 'ERROR' }
  );
}

// --------------------------
// Dashboard Stats with Table Fallback
// --------------------------

export interface DashboardData {
  stats: {
    totalBy: number;
    favorites: number;
  };
  recentNotes: Note[];
}

export async function safeDashboardStats(userId: string): Promise<DashboardData> {
  const result = await safeCall<DashboardData>(
    `dashboard-stats-${userId}`,
    async () => {
      if (!userId) {
        return { stats: { totalBy: 0, favorites: 0 }, recentNotes: [] };
      }

      // Fetch stats in parallel with minimal column selection
      const [totalRes, favRes, notesRes] = await Promise.all([
        supabase
          .from('notes')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', userId),
        supabase
          .from('notes')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', userId)
          .eq('is_favorite', true),
        supabase
          .from('notes')
          .select('id, title, is_favorite, created_at, updated_at')
          .eq('owner_id', userId)
          .order('updated_at', { ascending: false })
          .limit(3)
      ]);

      return {
        stats: {
          totalBy: totalRes.count || 0,
          favorites: favRes.count || 0
        },
        recentNotes: (notesRes.data || []) as Note[]
      };
    },
    {
      minDelay: 2000,
      fallback: { stats: { totalBy: 0, favorites: 0 }, recentNotes: [] }
    }
  );
  
  return result || { stats: { totalBy: 0, favorites: 0 }, recentNotes: [] };
}

// --------------------------
// Wallet (New)
// --------------------------
export async function safeWallet(userId: string): Promise<Wallet[]> {
  const result = await safeCall<Wallet[]>(
    `wallet-${userId}`,
    async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId);
        
      if (error) throw error;
      return (data || []) as Wallet[];
    },
    { minDelay: 2000, fallback: [] }
  );
  return result || [];
}

// --------------------------
// Generic supabaseSafe for dynamic operations
// --------------------------
export async function supabaseSafe<T>(
  key: string,
  fn: () => Promise<T | { data: T | null; error: any | null }>,
  options: { minDelay?: number; retries?: number; timeout?: number; fallback?: T } = {}
): Promise<T | null> {
  return safeCall<T | null>(key, async () => {
    const result = await fn();
    
    // Auto-unwrap Supabase response if needed
    if (result && typeof result === 'object' && 'error' in result) {
      const { data, error } = result as { data: T | null; error: any | null };
      if (error) throw error;
      return data;
    }
    
    return result as T;
  }, options);
}

// --------------------------
// Safe WebSocket Wrapper
// --------------------------
export function createSafeWebSocket(
  url: string,
  onOpen?: () => void,
  onMessage?: (data: unknown) => void,
  maxRetries = 3,
  retryDelay = 1000
): { close: () => void; send: (data: string) => void } {
  let retries = 0;
  let ws: WebSocket | null = null;
  let shouldReconnect = true;

  const connect = () => {
    if (!shouldReconnect) return;
    
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      retries = 0;
      onOpen?.();
    };

    ws.onmessage = (event) => {
      if (onMessage) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          onMessage(data);
        } catch (err) {
          console.warn("[WebSocket] Failed to parse message", err);
        }
      }
    };

    ws.onclose = () => {
      console.warn("[WebSocket] Closed");
      if (shouldReconnect && retries < maxRetries) {
        retries++;
        const delay = retryDelay * Math.pow(2, retries - 1); // Exponential backoff
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${retries}/${maxRetries})`);
        setTimeout(connect, delay);
      } else if (retries >= maxRetries) {
        console.error("[WebSocket] Max retries reached");
        toast.error("Connection lost. Please refresh the page.");
      }
    };

    ws.onerror = (err: Event) => {
      console.error("[WebSocket Error]", err);
    };
  };

  connect();

  return {
    close: () => {
      shouldReconnect = false;
      if (ws) ws.close();
    },
    send: (data: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      } else {
        console.warn("[WebSocket] Cannot send, connection not open");
      }
    }
  };
}

// --------------------------
// Ensure Profile Exists (Robust)
// --------------------------
export async function ensureProfile(user: any): Promise<Profile | null> {
  if (!user?.id) return null;

  // 1. Check if profile exists
  const profileResult = await safeProfile(user.id);
  
  // If we got an ERROR (timeout/network), DO NOT attempt creation
  if (profileResult === 'ERROR') {
    console.error('[Supabase] Profile fetch failed definitively. Aborting automatic creation.');
    return null;
  }

  // If we got an actual object, it's already there
  if (profileResult !== null) return profileResult;

  console.log('[Supabase] Profile missing for user, creating one...', user.id);

  // 2. Create profile if missing
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      username: (user.user_metadata?.username || user.email?.split('@')[0] || 'user') + '_' + user.id.slice(0, 5),
      full_name: user.user_metadata?.full_name || '',
      avatar_url: user.user_metadata?.avatar_url || '',
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Failed to create profile:', error.message);
    return null;
  }

  return newProfile as Profile | null;
}

// --------------------------
// Default Export
// --------------------------
export default {
  supabase,
  safeCall,
  safeTableQuery,
  safeAuth,
  safeProfile,
  safeSubscription,
  safeDashboardStats,
  safeWallet,
  supabaseSafe,
  createSafeWebSocket,
  ensureProfile
};
