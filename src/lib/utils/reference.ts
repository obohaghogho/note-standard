// ============================================================================
// Reference Generator — Prefixed, collision-resistant unique IDs
// ============================================================================

import { nanoid } from 'nanoid';

/** Reference prefixes by domain */
const PREFIX = {
  DEPOSIT: 'DEP',
  WITHDRAWAL: 'WDR',
  TRANSACTION: 'TXN',
  REFUND: 'RFD',
  RESERVATION: 'RSV',
  JOB: 'JOB',
  TRACE: 'TRC',
} as const;

type PrefixKey = keyof typeof PREFIX;

/**
 * Generates a unique, prefixed reference string.
 *
 * Format: `PREFIX_<nanoid>` (e.g., `DEP_V1StGXR8_Z5jdHi6B-myT`)
 *
 * @param type - The domain prefix for the reference
 * @param length - Length of the random portion (default: 21)
 * @returns A unique reference string
 */
export function generateReference(type: PrefixKey, length = 21): string {
  return `${PREFIX[type]}_${nanoid(length)}`;
}

/**
 * Generates a deposit reference.
 */
export function depositReference(): string {
  return generateReference('DEPOSIT');
}

/**
 * Generates a withdrawal reference.
 */
export function withdrawalReference(): string {
  return generateReference('WITHDRAWAL');
}

/**
 * Generates a generic transaction reference.
 */
export function transactionReference(): string {
  return generateReference('TRANSACTION');
}

/**
 * Generates a refund reference.
 */
export function refundReference(): string {
  return generateReference('REFUND');
}

/**
 * Generates a reservation reference.
 */
export function reservationReference(): string {
  return generateReference('RESERVATION');
}

/**
 * Generates a job queue reference.
 */
export function jobReference(): string {
  return generateReference('JOB');
}

/**
 * Generates a trace/correlation ID for request tracing.
 */
export function traceId(): string {
  return generateReference('TRACE', 16);
}
