// ============================================================================
// API: POST /api/v1/admin/reconciliation
// ============================================================================
// Admin-only endpoint to trigger a full system reconciliation.
// In production, restrict this via a separate admin auth check.
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException } from '@/lib/utils/response';
import { ReconciliationService } from '@/services/reconciliation.service';
import { createServiceClient } from '@/lib/supabase/server';

export const POST = withAuth(async (_request, ctx) => {
  try {
    // TODO: In production, add admin role check here
    // if (ctx.userTier !== 'admin') throw new ForbiddenError('Admin access required');

    const supabase = createServiceClient();
    const reconciliation = new ReconciliationService(supabase);
    const report = await reconciliation.reconcileAll();

    return success(report, 200, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
