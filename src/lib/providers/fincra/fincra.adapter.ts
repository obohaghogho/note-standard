// ============================================================================
// Fincra Adapter — STUBBED
// ============================================================================

import type { PaymentProvider } from '../interfaces/payment-provider.interface';
import type { InitializeTransactionParams, TransactionInitResult, VerificationResult, NormalizedWebhookEvent, RefundResult } from '../interfaces/types';
import { PaymentMethod } from '@/types';
import { NotImplementedError } from '@/lib/utils/errors';

export class FincraAdapter implements PaymentProvider {
  readonly name = 'fincra';
  readonly supportedCurrencies = ['NGN', 'USD', 'EUR', 'GBP'];
  readonly supportedMethods = [PaymentMethod.CARD, PaymentMethod.BANK_TRANSFER];

  async initializeTransaction(_params: InitializeTransactionParams): Promise<TransactionInitResult> {
    throw new NotImplementedError('Fincra initializeTransaction');
  }

  async verifyTransaction(_reference: string): Promise<VerificationResult> {
    throw new NotImplementedError('Fincra verifyTransaction');
  }

  validateWebhookSignature(_payload: string, _headers: Record<string, string>): boolean {
    throw new NotImplementedError('Fincra validateWebhookSignature');
  }

  parseWebhookEvent(_payload: string, _headers: Record<string, string>): NormalizedWebhookEvent {
    throw new NotImplementedError('Fincra parseWebhookEvent');
  }

  async refundTransaction(_reference: string, _amount?: number): Promise<RefundResult> {
    throw new NotImplementedError('Fincra refundTransaction');
  }
}
