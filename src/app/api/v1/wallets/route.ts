// ============================================================================
// API: GET/POST /api/v1/wallets
// ============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { success, errorFromException } from '@/lib/utils/response';
import { getServices } from '@/lib/container';
import { ValidationError } from '@/lib/utils/errors';

export const GET = withAuth(async (_request, ctx) => {
  try {
    const { wallet } = getServices();
    const wallets = await wallet.getWallets(ctx.userId);
    return success(wallets, 200, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});

export const POST = withAuth(async (request, ctx) => {
  try {
    const body = await request.json();
    const currency = body?.currency;

    if (!currency || typeof currency !== 'string') {
      throw new ValidationError('currency is required');
    }

    const { wallet } = getServices();
    const newWallet = await wallet.createWallet(ctx.userId, currency);
    return success(newWallet, 201, ctx.traceId);
  } catch (err) {
    return errorFromException(err, ctx.traceId);
  }
});
