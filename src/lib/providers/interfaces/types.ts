// ============================================================================
// Normalized Provider Types
// ============================================================================
// These types are the ONLY types that cross the provider boundary.
// Provider-specific types (PaystackResponse, etc.) stay inside their adapters.
// ============================================================================

import type { PaymentMethod } from '@/types';

// ---------------------------------------------------------------------------
// Payment Initialization
// ---------------------------------------------------------------------------

export interface InitializeTransactionParams {
  /** Amount in minor units (e.g., kobo) */
  amount: number;
  /** Currency code */
  currency: string;
  /** User's email (required by most providers) */
  email: string;
  /** Internal unique reference */
  reference: string;
  /** URL to redirect after payment */
  callbackUrl?: string;
  /** Additional metadata to store with the transaction */
  metadata?: Record<string, unknown>;
  /** Payment channels to allow */
  channels?: PaymentMethod[];
}

export interface TransactionInitResult {
  /** Provider-generated authorization URL (redirect user here) */
  authorizationUrl: string;
  /** Provider's access code / reference */
  accessCode: string;
  /** Our internal reference echoed back */
  reference: string;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerificationResult {
  /** Whether the payment was successful */
  verified: boolean;
  /** Amount actually paid (in minor units) */
  amount: number;
  /** Currency of the payment */
  currency: string;
  /** Channel used (card, bank_transfer, ussd, etc.) */
  channel: string;
  /** Provider's reference */
  providerReference: string;
  /** Our reference */
  reference: string;
  /** When the payment was completed */
  paidAt: string;
  /** Fees charged by the provider (in minor units) */
  fees: number;
  /** Provider-specific status string */
  providerStatus: string;
  /** Customer information */
  customer?: {
    email: string;
    id?: string;
    name?: string;
  };
  /** Full provider response for debugging (stored in metadata) */
  rawResponse: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export interface RefundResult {
  /** Whether the refund was initiated successfully */
  success: boolean;
  /** Provider's refund reference */
  providerReference: string;
  /** Amount refunded (in minor units) */
  amount: number;
  /** Currency */
  currency: string;
  /** Status of the refund */
  status: 'pending' | 'processed' | 'failed';
  /** Message from the provider */
  message: string;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | 'charge.success'
  | 'charge.failed'
  | 'transfer.success'
  | 'transfer.failed'
  | 'transfer.reversed'
  | 'refund.processed'
  | 'refund.failed'
  | 'crypto.confirmed'
  | 'crypto.failed'
  | 'dva.assignment'
  | 'unknown';

export interface NormalizedWebhookEvent {
  /** Normalized event type */
  eventType: WebhookEventType;
  /** The provider that sent the webhook */
  provider: string;
  /** Our internal reference (if available) */
  reference: string | null;
  /** Provider's reference */
  providerReference: string;
  /** Amount in minor units */
  amount: number;
  /** Currency code */
  currency: string;
  /** Channel used */
  channel: string | null;
  /** Fees charged */
  fees: number;
  /** When the event occurred */
  eventAt: string;
  /** Customer information */
  customer?: {
    email: string;
    id?: string;
  };
  /** Full raw payload for debugging */
  rawPayload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider Info
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  name: string;
  type: 'payment' | 'crypto' | 'payout';
  supportedCurrencies: string[];
  isHealthy: boolean;
}
