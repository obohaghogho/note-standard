// ============================================================================
// NowPayments Adapter — STUBBED
// ============================================================================

import type { CryptoProvider, CryptoPaymentParams, CryptoPaymentInitResult, CryptoPaymentStatus } from '../interfaces/crypto-provider.interface';
import type { NormalizedWebhookEvent } from '../interfaces/types';
import { NotImplementedError } from '@/lib/utils/errors';

export class NowPaymentsAdapter implements CryptoProvider {
  readonly name = 'nowpayments';
  readonly supportedAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'DOGE'];

  async createPayment(_params: CryptoPaymentParams): Promise<CryptoPaymentInitResult> {
    throw new NotImplementedError('NowPayments createPayment');
  }

  async getPaymentStatus(_paymentId: string): Promise<CryptoPaymentStatus> {
    throw new NotImplementedError('NowPayments getPaymentStatus');
  }

  validateWebhookSignature(_payload: string, _headers: Record<string, string>): boolean {
    throw new NotImplementedError('NowPayments validateWebhookSignature');
  }

  parseWebhookEvent(_payload: string, _headers: Record<string, string>): NormalizedWebhookEvent {
    throw new NotImplementedError('NowPayments parseWebhookEvent');
  }
}
