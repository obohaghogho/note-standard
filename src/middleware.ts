// ============================================================================
// Next.js Edge Middleware
// ============================================================================
// Runs on every request at the edge to:
// 1. Inject a trace ID header for distributed tracing
// 2. Protect API routes (except webhooks) from unauthenticated access
//    (detailed auth is done in withAuth, this is a fast pre-check)
// ============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Inject trace ID if not already present
  const traceId = request.headers.get('X-Trace-Id') || `TRC_${nanoid(16)}`;
  response.headers.set('X-Trace-Id', traceId);

  // Webhooks use HMAC auth, not JWT — skip auth pre-check
  if (request.nextUrl.pathname.includes('/webhooks/')) {
    return response;
  }

  // For API routes, check that Authorization header exists
  // (detailed validation happens in withAuth middleware)
  if (request.nextUrl.pathname.startsWith('/api/v1/')) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Authentication required',
            code: 'UNAUTHORIZED',
          },
          traceId,
        },
        { status: 401 },
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/v1/:path*'],
};
