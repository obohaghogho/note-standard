// ============================================================================
// LedgerService — Ledger entry queries and bulk reconciliation
// ============================================================================
// Provides cursor-based pagination, filtering, and status updates for
// ledger entries. Uses the Supabase service-role client to bypass RLS.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LedgerEntry,
  LedgerQueryFilters,
  TransactionStatus,
  ReconciliationResult,
} from '@/types';

/** Maximum entries per page. */
const MAX_LIMIT = 100;

/** Default entries per page. */
const DEFAULT_LIMIT = 20;

export interface LedgerPage {
  entries: LedgerEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export class LedgerService {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Retrieves ledger entries with optional filtering and cursor-based pagination.
   *
   * The cursor is a composite of `created_at` and `id`, encoded as a
   * base-64 string for opaque external consumption.
   *
   * @param filters - Optional query filters (walletId, type, status, category, date range, cursor, limit)
   * @returns A page of ledger entries with a cursor for the next page
   */
  async getEntries(filters: LedgerQueryFilters): Promise<LedgerPage> {
    const limit = Math.min(
      Math.max(filters.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    let query = this.supabase
      .from('ledger_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1); // fetch one extra to detect hasMore

    // Optional filters
    if (filters.walletId) {
      query = query.eq('wallet_id', filters.walletId);
    }
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.from) {
      query = query.gte('created_at', filters.from);
    }
    if (filters.to) {
      query = query.lte('created_at', filters.to);
    }

    // Cursor-based pagination (keyset pagination)
    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        query = query.or(
          `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error: queryError } = await query;

    if (queryError) {
      throw new Error(`Failed to fetch ledger entries: ${queryError.message}`);
    }

    const rows = (data ?? []) as LedgerEntry[];
    const hasMore = rows.length > limit;

    if (hasMore) {
      rows.pop(); // remove the extra row
    }

    const lastRow = rows[rows.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeCursor(lastRow.created_at, lastRow.id)
      : null;

    return {
      entries: rows,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Finds a ledger entry by its unique reference string.
   *
   * @returns The matching entry or `null` if none exists
   */
  async getEntryByReference(reference: string): Promise<LedgerEntry | null> {
    const { data, error: queryError } = await this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();

    if (queryError) {
      throw new Error(
        `Failed to fetch ledger entry by reference: ${queryError.message}`,
      );
    }

    return (data as LedgerEntry) ?? null;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /**
   * Updates the status of a ledger entry (e.g. pending → completed).
   */
  async updateEntryStatus(
    id: string,
    status: TransactionStatus,
  ): Promise<void> {
    const { error: updateError } = await this.supabase
      .from('ledger_entries')
      .update({ status })
      .eq('id', id);

    if (updateError) {
      throw new Error(
        `Failed to update ledger entry status: ${updateError.message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Bulk Reconciliation
  // -------------------------------------------------------------------------

  /**
   * Reconciles every wallet in the system.
   *
   * Fetches all distinct wallet IDs from the wallets table and calls the
   * `reconcile_wallet` RPC for each.
   *
   * @returns An array of reconciliation results, one per wallet
   */
  async reconcileAll(): Promise<ReconciliationResult[]> {
    const { data: wallets, error: queryError } = await this.supabase
      .from('wallets')
      .select('id');

    if (queryError) {
      throw new Error(`Failed to fetch wallets for reconciliation: ${queryError.message}`);
    }

    const results: ReconciliationResult[] = [];

    for (const wallet of wallets ?? []) {
      const { data, error: rpcError } = await this.supabase.rpc(
        'reconcile_wallet',
        { p_wallet_id: wallet.id },
      );

      if (rpcError) {
        console.error(
          `Reconciliation failed for wallet ${wallet.id}: ${rpcError.message}`,
        );
        continue;
      }

      const row = data as {
        wallet_id: string;
        currency: string;
        stored_balance: number;
        computed_balance: number;
        is_consistent: boolean;
      };

      results.push({
        walletId: row.wallet_id,
        currency: row.currency,
        storedBalance: row.stored_balance,
        computedBalance: row.computed_balance,
        isConsistent: row.is_consistent,
      });
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Cursor encoding helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a composite cursor from `created_at` and `id`.
 */
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url');
}

/**
 * Decodes a composite cursor back to its constituent parts.
 * Returns `null` if the cursor is malformed.
 */
function decodeCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt: string; id: string };

    if (
      typeof decoded.createdAt === 'string' &&
      typeof decoded.id === 'string'
    ) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}
