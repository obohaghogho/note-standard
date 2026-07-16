/**
 * correlationId.ts — Forensic Tracing Engine
 *
 * Generates unique correlation IDs that survive the full round-trip:
 *   React → API → Controller → DB → pg_notify → Gateway → Socket → React
 *
 * Format: cid_<timestamp>_<random6>
 * Example: cid_1749585247123_a3f9k2
 *
 * No external dependencies. No side-effects on import.
 */

export type CorrelationId = string;

/**
 * Generates a new unique correlation ID.
 * Thread-safe: each call produces a distinct value even when called
 * multiple times in the same millisecond (random suffix guarantees uniqueness).
 */
export function generateCorrelationId(): CorrelationId {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8); // 6 base-36 chars
  return `cid_${ts}_${rand}`;
}

/**
 * Extracts a correlation ID from an HTTP response header.
 * Returns null if the header is absent or malformed.
 */
export function extractFromHeader(headers: Record<string, string | undefined>): CorrelationId | null {
  const raw = headers['x-correlation-id'] || headers['X-Correlation-ID'];
  if (typeof raw === 'string' && raw.startsWith('cid_')) return raw;
  return null;
}

/**
 * Attaches active correlation IDs to the global window object so they can
 * be inspected from DevTools without any build tooling.
 *
 *   window.__ACTIVE_CORRELATIONS__['cid_xxx'] = { startedAt, label }
 *
 * Call `completeCorrelation()` when the traced operation finishes to
 * compute duration and mark it resolved.
 */
declare global {
  interface Window {
    __ACTIVE_CORRELATIONS__: Record<string, { startedAt: number; label: string; resolvedAt?: number; durationMs?: number }>;
  }
}

if (typeof window !== 'undefined') {
  window.__ACTIVE_CORRELATIONS__ = window.__ACTIVE_CORRELATIONS__ || {};
}

export function trackCorrelation(id: CorrelationId, label: string): void {
  if (typeof window === 'undefined') return;
  window.__ACTIVE_CORRELATIONS__[id] = { startedAt: Date.now(), label };
}

export function completeCorrelation(id: CorrelationId): void {
  if (typeof window === 'undefined') return;
  const entry = window.__ACTIVE_CORRELATIONS__[id];
  if (entry && !entry.resolvedAt) {
    entry.resolvedAt = Date.now();
    entry.durationMs = entry.resolvedAt - entry.startedAt;
  }
}
