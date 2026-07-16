// ============================================================================
// API: POST /api/v1/webhooks/[provider]
// ============================================================================

import { NextRequest } from 'next/server';
import { withWebhook } from '@/lib/auth/middleware';
import { success, errorFromException } from '@/lib/utils/response';
import { getServices } from '@/lib/container';

export const POST = withWebhook(async (request, traceId, routeParams) => {
  try {
    const params = routeParams?.params ? await routeParams.params : {};
    const providerName = params.provider;

    if (!providerName) {
      return errorFromException(new Error('Provider name is required'), traceId);
    }

    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const { webhookDispatcher, transactionEngine } = getServices();

    // 1. Validate signature and normalize
    const event = webhookDispatcher.dispatch(providerName, rawBody, headers);

    // 2. Process the event
    await transactionEngine.processWebhookEvent(event, traceId);

    return success({ received: true }, 200, traceId);
  } catch (err) {
    return errorFromException(err, traceId);
  }
});
