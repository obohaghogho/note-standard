// ============================================================================
// API: GET /api/v1/payments/verify?reference=xxx
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException } from '@/lib/utils/response';
import { getServices } from '@/lib/container';
import { ValidationError } from '@/lib/utils/errors';

export const GET = withAuth(async (request, ctx) => {
  try {
    const url = new URL(request.url);
    const reference = url.searchParams.get('reference');

    if (!reference) {
      throw new ValidationError('reference query parameter is required');
    }

    const { transactionEngine } = getServices();
    await transactionEngine.completeDeposit(reference, ctx.traceId);

    return success({ message: 'Payment verified and credited', reference }, 200, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
