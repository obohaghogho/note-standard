// ============================================================================
// Crypto Provider Interface
// ============================================================================

import type { NormalizedWebhookEvent } from './types';

export interface CryptoPaymentParams {
  /** Amount in minor units of the pay currency */
  amount: number;
  /** Currency the user is paying IN (e.g., 'BTC', 'ETH') */
  payCurrency: string;
  /** Currency the price is denominated in (e.g., 'USD', 'NGN') */
  priceCurrency: string;
  /** Internal reference for idempotency */
  orderId: string;
  /** Description shown to user */
  description?: string;
  /** Callback URL after payment */
  callbackUrl?: string;
}

export interface CryptoPaymentInitResult {
  /** Provider's payment ID */
  paymentId: string;
  /** Address or URL for payment */
  payAddress: string;
  /** Amount the user needs to send */
  payAmount: number;
  /** Currency the user pays in */
  payCurrency: string;
  /** Expiration time for the payment */
  expiresAt: string;
}

export interface CryptoPaymentStatus {
  paymentId: string;
  status: 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'finished' | 'failed' | 'refunded' | 'expired';
  actuallyPaid: number;
  payCurrency: string;
  outcomeAmount: number;
  outcomeCurrency: string;
}

export interface CryptoProvider {
  /** Unique provider identifier */
  readonly name: string;

  /** Crypto assets this provider supports */
  readonly supportedAssets: string[];

  /**
   * Create a crypto payment request.
   */
  createPayment(params: CryptoPaymentParams): Promise<CryptoPaymentInitResult>;

  /**
   * Check the status of a crypto payment.
   */
  getPaymentStatus(paymentId: string): Promise<CryptoPaymentStatus>;

  /**
   * Validate webhook signature.
   */
  validateWebhookSignature(
    payload: string,
    headers: Record<string, string>,
  ): boolean;

  /**
   * Parse webhook into normalized event.
   */
  parseWebhookEvent(
    payload: string,
    headers: Record<string, string>,
  ): NormalizedWebhookEvent;
}
