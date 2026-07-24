// ============================================================================
// API: POST /api/v1/payments/initialize
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException } from '@/lib/utils/response';
import { getServices } from '@/lib/container';
import { ValidationError } from '@/lib/utils/errors';
import { toMinorUnit, isValidMajorAmount } from '@/lib/utils/money';

export const POST = withAuth(async (request, ctx) => {
  try {
    const body = await request.json();
    const { amount, currency = 'NGN', callbackUrl, method } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    if (!isValidMajorAmount(amount, currency)) {
      throw new ValidationError(`Invalid amount for ${currency}`);
    }

    // Feature flag check
    const { featureFlags, transactionEngine } = getServices();
    await featureFlags.assertEnabled('deposits', ctx.userTier, ctx.userId);

    // Convert to minor units
    const minorAmount = toMinorUnit(amount, currency);

    const result = await transactionEngine.initializeDeposit(ctx, {
      amount: minorAmount,
      currency,
      method,
      callbackUrl,
    });

    return success(
      {
        checkoutUrl: result.checkoutUrl,
        reference: result.reference,
        accessCode: result.accessCode,
      },
      200,
      ctx.traceId,
    );
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
