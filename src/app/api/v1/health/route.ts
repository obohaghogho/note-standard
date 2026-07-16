// ============================================================================
// API: GET /api/v1/health
// ============================================================================

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      service: 'notestandard-payment-platform',
    },
    { status: 200 },
  );
}
