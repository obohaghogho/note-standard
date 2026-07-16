// ============================================================================
// API: GET /api/v1/withdrawals/[id]
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException, error } from '@/lib/utils/response';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = withAuth(async (_request, ctx, params) => {
  try {
    const withdrawalId = params?.id;
    if (!withdrawalId) return error('Withdrawal ID required', 400, 'VALIDATION_ERROR', ctx.traceId);

    const supabase = createServiceClient();
    const { data, error: queryError } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', withdrawalId)
      .single();

    if (queryError || !data) {
      return error('Withdrawal not found', 404, 'NOT_FOUND', ctx.traceId);
    }

    if (data.user_id !== ctx.userId) {
      return error('Access denied', 403, 'FORBIDDEN', ctx.traceId);
    }

    return success(data, 200, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
