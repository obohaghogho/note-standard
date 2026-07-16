// ============================================================================
// API: GET /api/v1/transactions
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { paginated, errorFromException, error } from '@/lib/utils/response';
import { getServices } from '@/lib/container';
import type { LedgerQueryFilters, TransactionType, TransactionStatus } from '@/types';

export const GET = withAuth(async (request, ctx) => {
  try {
    const { ledger, wallet } = getServices();
    const url = new URL(request.url);

    const walletId = url.searchParams.get('walletId');
    const type = url.searchParams.get('type') as TransactionType | null;
    const status = url.searchParams.get('status') as TransactionStatus | null;
    const category = url.searchParams.get('category');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const cursor = url.searchParams.get('cursor');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // If walletId provided, verify ownership
    if (walletId) {
      const w = await wallet.getWalletById(walletId);
      if (w.user_id !== ctx.userId) {
        return error('Access denied', 403, 'FORBIDDEN', ctx.traceId);
      }
    }

    // Build query filter
    let queryWalletId = walletId;

    // If no walletId, get all user's wallet IDs
    if (!queryWalletId) {
      const wallets = await wallet.getWallets(ctx.userId);
      if (wallets.length === 0) {
        return paginated([], null, false, 0, ctx.traceId);
      }
      // Use first wallet as default (most users have one)
      queryWalletId = wallets[0].id;
    }

    const filters: LedgerQueryFilters = {
      walletId: queryWalletId || undefined,
      type: type || undefined,
      status: status || undefined,
      category: category || undefined,
      from: from || undefined,
      to: to || undefined,
      cursor: cursor || undefined,
      limit: Math.min(limit, 100),
    };

    const result = await ledger.getEntries(filters);
    return paginated(result.entries, result.cursor, result.hasMore, undefined, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
