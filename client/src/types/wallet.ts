export enum ValuationMode {
    FRESH = 'FRESH',
    STALE = 'STALE',
    INVALID = 'INVALID'
}

/**
 * Unified Balance Model: Raw Holdings (TRUTH)
 * Standardized across all wallet types.
 */
export interface WalletEntry {
    id: string;
    type: "custodial" | "external" | "vault";
    asset: string;
    balance: number;       // Ledger Truth
    available: number;     // Ledger Truth
    locked: number;        // Ledger Truth
    source: "internal_ledger" | "external_provider";
    network?: string;
    address?: string;
    is_frozen: boolean;
    provider?: string;
}

/**
 * WalletView DTO: UI Projection (DISPLAY)
 * Produced ONLY by FinancialViewService.
 */
export interface WalletViewDTO {
    id: string;
    type: "custodial" | "external" | "vault";
    asset: string;
    balance: string;       // Formatted for display
    available: string;     // Formatted for display
    valuationUsd: string;  // Holdings * Price
    mode: ValuationMode;
    canExecute: boolean;   // Final blockade for financial actions
    evaluationId?: string; // v6.0 Forensic Replay Key
    network?: string;
    address?: string;
    isFrozen: boolean;
}

export interface GlobalViewDTO {
    totalBalanceValuation: string;
    totalAvailableValuation: string;
    ratesReady: boolean;
    systemStale: boolean;
    evaluationId?: string; // v6.0 Global Snapshot Replay Key
    frozenAssets?: string[]; // Scoped Freeze Domains
    regime?: string; // Market State (STABLE/VOLATILE)
}

// Legacy types preserved for compatibility during migration
export type Currency = string;

export interface InternalTransferRequest {
    currency: string;
    amount: number;
    recipientEmail?: string;
    recipientAddress?: string;
    recipientId?: string;
    idempotencyKey?: string;
    captchaToken?: string;
}

export interface WithdrawalRequest {
    amount: number;
    currency: Currency;
    bankId?: string; // For fiat
    address?: string; // For crypto
    bank_code?: string;
    swift_code?: string;
    branch_code?: string;
    account_number?: string;
    account_name?: string;
    bank_name?: string;
    country?: string;
    network?: string;
    idempotencyKey?: string;
    captchaToken?: string;
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
    toCurrency?: Currency;
    toNetwork?: string;
    targetCurrency?: Currency; // Alias for backend consistency
    targetNetwork?: string;
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
    payAddress?: string; // Some providers use address, others payAddress
    network: string;
    minDeposit: number;
    reference: string;
    paymentUrl?: string;
}

// Swap Types
export interface SwapRequest {
    fromCurrency: Currency;
    toCurrency: Currency;
    amount: number;
    fromNetwork?: string;
    toNetwork?: string;
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
    lockId: string;
    expiresAt: number;
    metadata?: Record<string, unknown>;
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

export interface LedgerEntry {
    id: string;
    user_id: string;
    wallet_id: string;
    currency: string;
    amount: number;       // positive = credit, negative = debit
    type: string;
    reference: string;
    status: string;
    created_at: string;
}
