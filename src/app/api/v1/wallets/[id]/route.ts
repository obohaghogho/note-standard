// ============================================================================
// API: GET /api/v1/wallets/[id]
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException, error } from '@/lib/utils/response';
import { getServices } from '@/lib/container';

export const GET = withAuth(async (_request, ctx, params) => {
  try {
    const walletId = params?.id;
    if (!walletId) return error('Wallet ID required', 400, 'VALIDATION_ERROR', ctx.traceId);

    const { wallet, ledger } = getServices();

    const w = await wallet.getWalletById(walletId);

    // Verify ownership
    if (w.user_id !== ctx.userId) {
      return error('Access denied', 403, 'FORBIDDEN', ctx.traceId);
    }

    // Fetch recent transactions
    const { entries: recentTransactions } = await ledger.getEntries({
      walletId,
      limit: 10,
    });

    return success({ wallet: w, recentTransactions }, 200, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
