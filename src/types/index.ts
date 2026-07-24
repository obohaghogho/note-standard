// ============================================================================
// NoteStandard Payment Platform — Shared Types
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

export enum ProviderTransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  CRYPTO_PURCHASE = 'crypto_purchase',
  CRYPTO_SALE = 'crypto_sale',
  REFUND = 'refund',
}

export enum ProviderTransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
  REFUNDED = 'refunded',
}

export enum WithdrawalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

export enum DestinationType {
  BANK = 'bank',
  CRYPTO = 'crypto',
  MOBILE_MONEY = 'mobile_money',
}

export enum ReservationType {
  CARD_AUTHORIZATION = 'card_authorization',
  ESCROW = 'escrow',
  MARKETPLACE_HOLD = 'marketplace_hold',
  CRYPTO_SWAP = 'crypto_swap',
  P2P_TRANSFER = 'p2p_transfer',
  WITHDRAWAL_HOLD = 'withdrawal_hold',
}

export enum ReservationStatus {
  ACTIVE = 'active',
  CAPTURED = 'captured',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

export enum CurrencyType {
  FIAT = 'fiat',
  CRYPTO = 'crypto',
}

export enum PaymentMethod {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  USSD = 'ussd',
  QR = 'qr',
  CRYPTO = 'crypto',
  MOBILE_MONEY = 'mobile_money',
}

export enum RiskDecision {
  ALLOW = 'allow',
  FLAG = 'flag',
  BLOCK = 'block',
}

export enum RiskSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

export enum ActorType {
  USER = 'user',
  ADMIN = 'admin',
  SYSTEM = 'system',
  WEBHOOK = 'webhook',
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD = 'dead',
}

// ---------------------------------------------------------------------------
// Transaction Categories (constants, not an enum for extensibility)
// ---------------------------------------------------------------------------

export const TransactionCategory = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  CRYPTO_PURCHASE: 'crypto_purchase',
  CRYPTO_SALE: 'crypto_sale',
  REFUND: 'refund',
  FEE: 'fee',
  REWARD: 'reward',
  P2P_TRANSFER: 'p2p_transfer',
  ADJUSTMENT: 'adjustment',
} as const;

export type TransactionCategoryValue =
  (typeof TransactionCategory)[keyof typeof TransactionCategory];

// ---------------------------------------------------------------------------
// Database Row Types
// ---------------------------------------------------------------------------

export interface Wallet {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  available_balance: number;
  reserved_balance: number;
  locked_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  balance_before: number;
  balance_after: number;
  status: TransactionStatus;
  category: string;
  description: string | null;
  reference: string;
  provider: string | null;
  provider_reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProviderTransaction {
  id: string;
  user_id: string;
  provider: string;
  provider_reference: string | null;
  internal_reference: string;
  type: ProviderTransactionType;
  amount: number;
  currency: string;
  status: ProviderTransactionStatus;
  channel: string | null;
  provider_fees: number;
  provider_response: Record<string, unknown>;
  paid_at: string | null;
  ledger_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  wallet_id: string;
  amount: number;
  fee: number;
  currency: string;
  status: WithdrawalStatus;
  destination_type: DestinationType;
  destination_details: BankDestination | CryptoDestination;
  provider: string | null;
  provider_reference: string | null;
  reservation_id: string | null;
  rejection_reason: string | null;
  risk_score: number | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  ledger_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletReservation {
  id: string;
  wallet_id: string;
  amount: number;
  currency: string;
  type: ReservationType;
  status: ReservationStatus;
  reference: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  expires_at: string;
  captured_at: string | null;
  released_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_type: ActorType;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RiskEvent {
  id: string;
  user_id: string;
  event_type: string;
  severity: RiskSeverity;
  decision: RiskDecision;
  reason: string;
  related_reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  type: CurrencyType;
  minor_unit_name: string | null;
  minor_unit_factor: number;
  symbol: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FeatureFlag {
  key: string;
  is_enabled: boolean;
  description: string | null;
  rollout_percentage: number;
  allowed_tiers: string[];
  metadata: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

export interface SystemConfig {
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ProviderHealth {
  provider_name: string;
  status: ProviderHealthStatus;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  avg_latency_ms: number | null;
  success_rate_24h: number | null;
  last_check_at: string;
  metadata: Record<string, unknown>;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Destination Detail Types
// ---------------------------------------------------------------------------

export interface BankDestination {
  bank_code: string;
  account_number: string;
  account_name: string;
}

export interface CryptoDestination {
  wallet_address: string;
  network: string;
}

// ---------------------------------------------------------------------------
// Request Context (injected by auth middleware)
// ---------------------------------------------------------------------------

export interface RequestContext {
  userId: string;
  userTier: string;
  ipAddress: string | null;
  userAgent: string | null;
  traceId: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  traceId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
  };
  traceId?: string;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
  traceId?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Service Parameter Types
// ---------------------------------------------------------------------------

export interface CreditWalletParams {
  walletId: string;
  amount: number;
  currency: string;
  reference: string;
  category: TransactionCategoryValue;
  description?: string;
  provider?: string;
  providerReference?: string;
  metadata?: Record<string, unknown>;
}

export interface DebitWalletParams {
  walletId: string;
  amount: number;
  currency: string;
  reference: string;
  category: TransactionCategoryValue;
  description?: string;
  provider?: string;
  providerReference?: string;
  metadata?: Record<string, unknown>;
}

export interface ReserveWalletParams {
  walletId: string;
  amount: number;
  currency: string;
  reference: string;
  type: ReservationType;
  expiresAt: Date;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
}

export interface DepositParams {
  amount: number;
  currency: string;
  method?: PaymentMethod;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface WithdrawalParams {
  amount: number;
  currency: string;
  destinationType: DestinationType;
  destinationDetails: BankDestination | CryptoDestination;
}

export interface LedgerQueryFilters {
  walletId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  category?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface RiskAssessment {
  decision: RiskDecision;
  score: number;
  reasons: string[];
}

export interface ReconciliationResult {
  walletId: string;
  currency: string;
  storedBalance: number;
  computedBalance: number;
  isConsistent: boolean;
}
