// ============================================================================
// Payout Provider Interface
// ============================================================================

import type { NormalizedWebhookEvent } from './types';

export interface TransferParams {
  /** Amount in minor units */
  amount: number;
  currency: string;
  /** Recipient bank code */
  bankCode: string;
  /** Recipient account number */
  accountNumber: string;
  /** Recipient name (for verification) */
  accountName: string;
  /** Internal reference */
  reference: string;
  /** Reason / description */
  reason?: string;
}

export interface TransferResult {
  /** Provider's transfer reference */
  providerReference: string;
  /** Status after initiation */
  status: 'pending' | 'processing' | 'success' | 'failed';
  /** Human-readable message */
  message: string;
}

export interface TransferStatus {
  providerReference: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'reversed';
  amount: number;
  currency: string;
  completedAt?: string;
  failureReason?: string;
}

export interface Bank {
  code: string;
  name: string;
  country: string;
  currency: string;
  type: string;
}

export interface AccountInfo {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

export interface PayoutProvider {
  /** Unique provider identifier */
  readonly name: string;

  /** Currencies this payout provider supports */
  readonly supportedCurrencies: string[];

  /**
   * Initiate a bank transfer / payout.
   */
  initiateTransfer(params: TransferParams): Promise<TransferResult>;

  /**
   * Verify the status of a transfer.
   */
  verifyTransfer(reference: string): Promise<TransferStatus>;

  /**
   * List available banks for a country.
   */
  listBanks(countryCode: string): Promise<Bank[]>;

  /**
   * Resolve/verify a bank account number.
   */
  resolveAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<AccountInfo>;

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
