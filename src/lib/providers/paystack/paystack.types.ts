// ============================================================================
// Paystack Internal Types
// ============================================================================
// These types are INTERNAL to the Paystack adapter.
// They are NEVER exported or used outside this directory.
// ============================================================================

export interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackInitializeData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyData {
  id: number;
  domain: string;
  status: 'success' | 'failed' | 'abandoned';
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  gateway_response: string;
  ip_address: string;
  fees: number;
  paid_at: string;
  created_at: string;
  customer: {
    id: number;
    email: string;
    first_name: string | null;
    last_name: string | null;
    customer_code: string;
  };
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    channel: string;
    card_type: string;
    bank: string;
    country_code: string;
    brand: string;
    reusable: boolean;
    signature: string;
    account_name: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface PaystackRefundData {
  transaction: number;
  id: number;
  status: 'pending' | 'processed' | 'failed';
  amount: number;
  currency: string;
  merchant_note: string;
}

export interface PaystackWebhookPayload {
  event: string;
  data: PaystackVerifyData & {
    transfer_code?: string;
    recipient?: {
      type: string;
      name: string;
      details: {
        account_number: string;
        account_name: string;
        bank_code: string;
        bank_name: string;
      };
    };
  };
}

export interface PaystackTransferData {
  reference: string;
  integration: number;
  domain: string;
  amount: number;
  currency: string;
  source: string;
  reason: string;
  recipient: number;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  transfer_code: string;
  id: number;
  created_at: string;
  updated_at: string;
}

export interface PaystackTransferRecipient {
  active: boolean;
  id: number;
  type: string;
  name: string;
  details: {
    authorization_code: string | null;
    account_number: string;
    account_name: string;
    bank_code: string;
    bank_name: string;
  };
  recipient_code: string;
  currency: string;
}

export interface PaystackBankData {
  name: string;
  slug: string;
  code: string;
  longcode: string;
  gateway: string | null;
  pay_with_bank: boolean;
  active: boolean;
  country: string;
  currency: string;
  type: string;
  is_deleted: boolean;
  id: number;
}

export interface PaystackResolveAccountData {
  account_number: string;
  account_name: string;
  bank_id: number;
}
