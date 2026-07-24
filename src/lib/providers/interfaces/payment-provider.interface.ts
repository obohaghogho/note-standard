// ============================================================================
// Payment Provider Interface
// ============================================================================
// All payment providers (Paystack, Fincra, Flutterwave, etc.) must implement
// this interface. Business logic NEVER depends on provider-specific types.
// ============================================================================

import type { PaymentMethod } from '@/types';
import type {
  InitializeTransactionParams,
  TransactionInitResult,
  VerificationResult,
  NormalizedWebhookEvent,
  RefundResult,
} from './types';

export interface PaymentProvider {
  /** Unique provider identifier (e.g., 'paystack', 'fincra') */
  readonly name: string;

  /** Currencies this provider can process payments for */
  readonly supportedCurrencies: string[];

  /** Payment methods this provider supports */
  readonly supportedMethods: PaymentMethod[];

  /**
   * Initialize a payment transaction with the provider.
   * Returns a checkout URL or authorization data.
   */
  initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<TransactionInitResult>;

  /**
   * Verify a transaction's status with the provider.
   * Called after webhook or redirect to confirm payment.
   */
  verifyTransaction(reference: string): Promise<VerificationResult>;

  /**
   * Validate the cryptographic signature of an incoming webhook.
   * Returns true if the signature is valid.
   */
  validateWebhookSignature(
    payload: string,
    headers: Record<string, string>,
  ): boolean;

  /**
   * Parse a raw webhook payload into a normalized event.
   * Called AFTER signature validation succeeds.
   */
  parseWebhookEvent(
    payload: string,
    headers: Record<string, string>,
  ): NormalizedWebhookEvent;

  /**
   * Initiate a refund for a completed transaction.
   * @param amount - Partial refund amount in minor units. If omitted, full refund.
   */
  refundTransaction(
    reference: string,
    amount?: number,
  ): Promise<RefundResult>;
}
