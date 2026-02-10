export type Currency = string;

export interface WalletBalance {
  currency: Currency;
  amount: number;
}

export interface WalletTransaction {
  id: string;
  fromUserId?: string;
  toUserId?: string;
  currency: Currency;
  amount: number;
  createdAt: string;
}

// Legacy / Full Interfaces (Updated Currency)
export interface Wallet {
    id: string;
    user_id: string;
    currency: Currency;
    balance: number;
    available_balance: number;
    address: string;
    is_frozen: boolean;
    created_at: string;
    updated_at: string;
}

export interface Transaction {
    id: string;
    wallet_id: string;
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'BUY' | 'SELL' | 'SWAP';
    amount: number;
    currency: Currency;
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    reference_id?: string;
    external_hash?: string;
    fee: number;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    wallet?: {
        currency: Currency;
    };
}

export interface InternalTransferRequest {
    recipientEmail?: string;
    recipientId?: string;
    amount: number;
    currency: Currency;
    idempotencyKey?: string;
}

export interface WithdrawalRequest {
    amount: number;
    currency: Currency;
    bankId?: string; // For fiat
    address?: string; // For crypto
    idempotencyKey?: string;
}

export interface CommissionSettings {
    transaction_type: string;
    commission_type: 'PERCENTAGE' | 'FIXED';
    value: number;
    min_fee: number;
    max_fee: number | null;
    currency: string | null;
}

// Deposit Types
export interface DepositRequest {
    currency: Currency;
    amount: number;
}

export interface CardDepositResponse {
    reference: string;
    checkoutUrl: string;
    amount: number;
    currency: Currency;
}

export interface BankDepositResponse {
    reference: string;
    amount: number;
    currency: Currency;
    bankDetails: {
        bankName: string;
        accountNumber: string;
        accountName: string;
        reference: string;
        routingNumber?: string;
    };
    expiresAt: string;
}

export interface CryptoDepositResponse {
    currency: Currency;
    address: string;
    network: string;
    minDeposit: number;
}

// Swap Types
export interface SwapRequest {
    fromCurrency: Currency;
    toCurrency: Currency;
    amount: number;
    idempotencyKey?: string;
}

export interface SwapPreview {
    fromCurrency: Currency;
    toCurrency: Currency;
    amountIn: number;
    rate: number;
    fee: number;
    feePercentage: number;
    amountOut: number;
    netAmount: number;
}

export interface SwapResult {
    success: boolean;
    reference: string;
    fromCurrency: Currency;
    toCurrency: Currency;
    amountIn: number;
    amountOut: number;
    fee: number;
    rate: number;
}

export type ExchangeRates = Record<Currency, Partial<Record<Currency, number>>>;

