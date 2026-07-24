// ============================================================================
// Standardized API Response Helpers
// ============================================================================

import { NextResponse } from 'next/server';
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '@/types';
import { PlatformError } from './errors';

/**
 * Returns a standardized success response.
 */
export function success<T>(
  data: T,
  statusCode = 200,
  traceId?: string,
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    { success: true as const, data, traceId },
    { status: statusCode },
  );
}

/**
 * Returns a standardized error response.
 */
export function error(
  message: string,
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  traceId?: string,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false as const,
      error: { message, code },
      traceId,
    },
    { status: statusCode },
  );
}

/**
 * Returns a standardized error response from a PlatformError.
 */
export function errorFromException(
  err: unknown,
  traceId?: string,
): NextResponse<ApiErrorResponse> {
  if (err instanceof PlatformError) {
    return error(err.message, err.statusCode, err.code, traceId);
  }

  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred';

  console.error('[Unhandled Error]', err);
  return error(message, 500, 'INTERNAL_ERROR', traceId);
}

/**
 * Returns a standardized paginated response.
 */
export function paginated<T>(
  data: T[],
  cursor: string | null,
  hasMore: boolean,
  total?: number,
  traceId?: string,
): NextResponse<ApiPaginatedResponse<T>> {
  return NextResponse.json(
    {
      success: true as const,
      data,
      pagination: { cursor, hasMore, total },
      traceId,
    },
    { status: 200 },
  );
}
