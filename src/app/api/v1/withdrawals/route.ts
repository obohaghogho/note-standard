// ============================================================================
// API: GET/POST /api/v1/withdrawals
// ============================================================================

import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException } from '@/lib/utils/response';
import { getServices } from '@/lib/container';
import { ValidationError } from '@/lib/utils/errors';
import { toMinorUnit, isValidMajorAmount } from '@/lib/utils/money';
import { WithdrawalService } from '@/services/withdrawal.service';
import { ReservationService } from '@/services/reservation.service';
import { RiskEngineService } from '@/services/risk-engine.service';
import { createServiceClient } from '@/lib/supabase/server';
import { eventBus } from '@/lib/events/event-bus';

function getWithdrawalService() {
  const supabase = createServiceClient();
  const { wallet } = getServices();
  const reservation = new ReservationService(supabase);
  const risk = new RiskEngineService(supabase);
  return new WithdrawalService(supabase, wallet, reservation, risk, eventBus);
}

export const GET = withAuth(async (_request, ctx) => {
  try {
    const service = getWithdrawalService();
    const withdrawals = await service.getWithdrawals(ctx.userId);
    return success(withdrawals, 200, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});

export const POST = withAuth(async (request, ctx) => {
  try {
    const body = await request.json();
    const { amount, currency = 'NGN', destinationType, destinationDetails } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }
    if (!isValidMajorAmount(amount, currency)) {
      throw new ValidationError(`Invalid amount for ${currency}`);
    }
    if (!destinationType) {
      throw new ValidationError('destinationType is required');
    }
    if (!destinationDetails) {
      throw new ValidationError('destinationDetails is required');
    }

    const { featureFlags } = getServices();
    await featureFlags.assertEnabled('withdrawals', ctx.userTier, ctx.userId);

    const service = getWithdrawalService();
    const withdrawal = await service.createWithdrawal(ctx, {
      amount: toMinorUnit(amount, currency),
      currency,
      destinationType,
      destinationDetails,
    });

    return success(withdrawal, 201, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
