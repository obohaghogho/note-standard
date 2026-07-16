// ============================================================================
// Auth Middleware — withAuth Higher-Order Function
// ============================================================================
// Wraps API route handlers to:
// 1. Extract and validate the user's JWT via Supabase
// 2. Build a RequestContext with userId, tier, IP, user-agent, and traceId
// 3. Return 401 for unauthenticated requests
// 4. Support an optional Idempotency-Key header
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteClient } from '@/lib/supabase/server';
import { traceId as generateTraceId } from '@/lib/utils/reference';
import { error } from '@/lib/utils/response';
import type { RequestContext } from '@/types';

/**
 * Handler function type that receives an authenticated request context.
 */
export type AuthenticatedHandler = (
  request: NextRequest,
  context: RequestContext,
  params?: Record<string, string>,
) => Promise<NextResponse>;

/**
 * Handler for routes that accept dynamic route parameters from Next.js.
 */
export type AuthenticatedHandlerWithParams = (
  request: NextRequest,
  context: RequestContext,
  routeParams: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

/**
 * Wraps an API route handler with authentication.
 *
 * Validates the user's JWT, builds a RequestContext, and passes it to the handler.
 * Returns a 401 error if the user is not authenticated.
 *
 * @example
 * export const GET = withAuth(async (request, ctx) => {
 *   // ctx.userId is guaranteed to exist
 *   return success({ userId: ctx.userId });
 * });
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (
    request: NextRequest,
    routeContext?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const tId = request.headers.get('X-Trace-Id') || generateTraceId();

    try {
      const supabase = createRouteClient(request);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return error('Authentication required', 401, 'UNAUTHORIZED', tId);
      }

      const ctx: RequestContext = {
        userId: user.id,
        userTier: (user.user_metadata?.tier_id as string) || 'basic',
        ipAddress: extractIp(request),
        userAgent: request.headers.get('user-agent'),
        traceId: tId,
      };

      const params = routeContext?.params ? await routeContext.params : undefined;
      return await handler(request, ctx, params);
    } catch (err) {
      console.error(`[${tId}] Auth middleware error:`, err);
      return error('Internal authentication error', 500, 'AUTH_ERROR', tId);
    }
  };
}

/**
 * Wraps a webhook route handler — no auth required, but trace ID is injected.
 * Used for provider webhooks that authenticate via HMAC signature instead of JWT.
 */
export function withWebhook(
  handler: (
    request: NextRequest,
    traceId: string,
    routeParams?: { params: Promise<Record<string, string>> },
  ) => Promise<NextResponse>,
) {
  return async (
    request: NextRequest,
    routeContext?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const tId = request.headers.get('X-Trace-Id') || generateTraceId();

    try {
      return await handler(request, tId, routeContext);
    } catch (err) {
      console.error(`[${tId}] Webhook handler error:`, err);
      return error('Webhook processing error', 500, 'WEBHOOK_ERROR', tId);
    }
  };
}

/**
 * Extracts the client IP address from the request.
 * Checks common proxy headers first, then falls back to the connection.
 */
function extractIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  );
}

/**
 * Extracts the Idempotency-Key header if present.
 */
export function getIdempotencyKey(request: NextRequest): string | null {
  return request.headers.get('Idempotency-Key');
}
