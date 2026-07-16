// ============================================================================
// Paystack Adapter — implements PaymentProvider + PayoutProvider
// ============================================================================

import { createHmac } from 'crypto';
import type { PaymentProvider } from '../interfaces/payment-provider.interface';
import type { PayoutProvider, TransferParams, TransferResult, TransferStatus, Bank, AccountInfo } from '../interfaces/payout-provider.interface';
import type {
  InitializeTransactionParams,
  TransactionInitResult,
  VerificationResult,
  NormalizedWebhookEvent,
  RefundResult,
  WebhookEventType,
} from '../interfaces/types';
import { PaymentMethod } from '@/types';
import { ProviderApiError } from '@/lib/utils/errors';
import type {
  PaystackApiResponse,
  PaystackInitializeData,
  PaystackVerifyData,
  PaystackRefundData,
  PaystackWebhookPayload,
  PaystackBankData,
  PaystackResolveAccountData,
  PaystackTransferData,
  PaystackTransferRecipient,
} from './paystack.types';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export class PaystackAdapter implements PaymentProvider, PayoutProvider {
  readonly name = 'paystack';
  readonly supportedCurrencies = ['NGN', 'GHS', 'ZAR', 'USD'];
  readonly supportedMethods = [
    PaymentMethod.CARD,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.USSD,
    PaymentMethod.QR,
  ];

  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(secretKey?: string, webhookSecret?: string) {
    this.secretKey = secretKey || process.env.PAYSTACK_SECRET_KEY || '';
    this.webhookSecret = webhookSecret || process.env.PAYSTACK_WEBHOOK_SECRET || '';

    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is required');
    }
  }

  // -------------------------------------------------------------------------
  // PaymentProvider Implementation
  // -------------------------------------------------------------------------

  async initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<TransactionInitResult> {
    const body = {
      amount: params.amount,
      email: params.email,
      reference: params.reference,
      currency: params.currency,
      callback_url: params.callbackUrl,
      metadata: params.metadata || {},
      channels: params.channels?.map(this.mapChannel).filter(Boolean),
    };

    const data = await this.request<PaystackInitializeData>(
      'POST',
      '/transaction/initialize',
      body,
    );

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<VerificationResult> {
    const data = await this.request<PaystackVerifyData>(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );

    return {
      verified: data.status === 'success',
      amount: data.amount,
      currency: data.currency,
      channel: data.channel,
      providerReference: String(data.id),
      reference: data.reference,
      paidAt: data.paid_at,
      fees: data.fees,
      providerStatus: data.status,
      customer: {
        email: data.customer.email,
        id: data.customer.customer_code,
        name: [data.customer.first_name, data.customer.last_name]
          .filter(Boolean)
          .join(' ') || undefined,
      },
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  validateWebhookSignature(
    payload: string,
    headers: Record<string, string>,
  ): boolean {
    const signature = headers['x-paystack-signature'];
    if (!signature || !this.webhookSecret) return false;

    const hash = createHmac('sha512', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  parseWebhookEvent(
    payload: string,
    _headers: Record<string, string>,
  ): NormalizedWebhookEvent {
    const body: PaystackWebhookPayload = JSON.parse(payload);
    const eventType = this.mapEventType(body.event);

    return {
      eventType,
      provider: this.name,
      reference: body.data.reference || null,
      providerReference: String(body.data.id || body.data.transfer_code || ''),
      amount: body.data.amount || 0,
      currency: body.data.currency || 'NGN',
      channel: body.data.channel || null,
      fees: body.data.fees || 0,
      eventAt: body.data.paid_at || body.data.created_at || new Date().toISOString(),
      customer: body.data.customer
        ? {
            email: body.data.customer.email,
            id: body.data.customer.customer_code,
          }
        : undefined,
      rawPayload: body as unknown as Record<string, unknown>,
    };
  }

  async refundTransaction(
    reference: string,
    amount?: number,
  ): Promise<RefundResult> {
    const body: Record<string, unknown> = { transaction: reference };
    if (amount !== undefined) {
      body.amount = amount;
    }

    const data = await this.request<PaystackRefundData>('POST', '/refund', body);

    return {
      success: true,
      providerReference: String(data.id),
      amount: data.amount,
      currency: data.currency,
      status: data.status === 'processed' ? 'processed' : 'pending',
      message: `Refund ${data.status}`,
    };
  }

  // -------------------------------------------------------------------------
  // PayoutProvider Implementation
  // -------------------------------------------------------------------------

  async initiateTransfer(params: TransferParams): Promise<TransferResult> {
    // First, create a transfer recipient
    const recipient = await this.request<PaystackTransferRecipient>(
      'POST',
      '/transferrecipient',
      {
        type: 'nuban',
        name: params.accountName,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: params.currency,
      },
    );

    // Then initiate the transfer
    const transfer = await this.request<PaystackTransferData>(
      'POST',
      '/transfer',
      {
        source: 'balance',
        amount: params.amount,
        recipient: recipient.recipient_code,
        reason: params.reason || 'Withdrawal',
        reference: params.reference,
        currency: params.currency,
      },
    );

    return {
      providerReference: transfer.transfer_code,
      status: transfer.status === 'success' ? 'success' : 'pending',
      message: `Transfer ${transfer.status}`,
    };
  }

  async verifyTransfer(reference: string): Promise<TransferStatus> {
    const data = await this.request<PaystackTransferData>(
      'GET',
      `/transfer/verify/${encodeURIComponent(reference)}`,
    );

    return {
      providerReference: data.transfer_code,
      status: data.status as TransferStatus['status'],
      amount: data.amount,
      currency: data.currency,
      completedAt: data.status === 'success' ? data.updated_at : undefined,
      failureReason: data.status === 'failed' ? 'Transfer failed' : undefined,
    };
  }

  async listBanks(countryCode: string): Promise<Bank[]> {
    const data = await this.request<PaystackBankData[]>(
      'GET',
      `/bank?country=${countryCode.toLowerCase()}&perPage=100`,
    );

    return data
      .filter((b) => b.active && !b.is_deleted)
      .map((b) => ({
        code: b.code,
        name: b.name,
        country: b.country,
        currency: b.currency,
        type: b.type,
      }));
  }

  async resolveAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<AccountInfo> {
    const data = await this.request<PaystackResolveAccountData>(
      'GET',
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    );

    return {
      accountNumber: data.account_number,
      accountName: data.account_name,
      bankCode,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${PAYSTACK_BASE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    let response: Response;

    try {
      response = await fetch(url, options);
    } catch (err) {
      throw new ProviderApiError(
        this.name,
        `Network error: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    }

    const latencyMs = Date.now() - startTime;
    const responseData = (await response.json()) as PaystackApiResponse<T>;

    if (!response.ok || !responseData.status) {
      throw new ProviderApiError(
        this.name,
        responseData.message || `HTTP ${response.status}`,
        response.status >= 500 ? 502 : 400,
      );
    }

    // Log latency for health monitoring (will be consumed by HealthMonitor)
    console.log(
      `[Paystack] ${method} ${path} — ${response.status} in ${latencyMs}ms`,
    );

    return responseData.data;
  }

  private mapEventType(event: string): WebhookEventType {
    const mapping: Record<string, WebhookEventType> = {
      'charge.success': 'charge.success',
      'charge.failed': 'charge.failed',
      'transfer.success': 'transfer.success',
      'transfer.failed': 'transfer.failed',
      'transfer.reversed': 'transfer.reversed',
      'refund.processed': 'refund.processed',
      'refund.failed': 'refund.failed',
      'dedicatedaccount.assign.success': 'dva.assignment',
    };
    return mapping[event] || 'unknown';
  }

  private mapChannel(method: PaymentMethod): string | null {
    const mapping: Record<PaymentMethod, string | null> = {
      [PaymentMethod.CARD]: 'card',
      [PaymentMethod.BANK_TRANSFER]: 'bank',
      [PaymentMethod.USSD]: 'ussd',
      [PaymentMethod.QR]: 'qr',
      [PaymentMethod.CRYPTO]: null,
      [PaymentMethod.MOBILE_MONEY]: 'mobile_money',
    };
    return mapping[method];
  }
}
