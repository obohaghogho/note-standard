// ============================================================================
// Event Payload Types & EventMap
// ============================================================================
// All event payload interfaces for the in-process event bus.
// Money amounts are in minor units (kobo for NGN).
// Every payload carries a traceId for end-to-end tracing.
// ============================================================================

import type {
  DestinationType,
  ProviderHealthStatus,
  ReservationType,
  RiskDecision,
  TransactionCategoryValue,
} from '@/types';

// ---------------------------------------------------------------------------
// Payload Interfaces
// ---------------------------------------------------------------------------

/** Emitted when a deposit is completed or fails. */
export interface DepositEventPayload {
  userId: string;
  walletId: string;
  /** Amount in minor units (kobo) */
  amount: number;
  currency: string;
  reference: string;
  provider: string;
  channel?: string;
  traceId: string;
}

/** Emitted when a withdrawal changes state. */
export interface WithdrawalEventPayload {
  userId: string;
  walletId: string;
  /** Amount in minor units (kobo) */
  amount: number;
  currency: string;
  reference: string;
  requestId: string;
  destinationType: DestinationType;
  provider?: string;
  traceId: string;
}

/** Emitted after a wallet credit or debit. */
export interface WalletEventPayload {
  userId: string;
  walletId: string;
  /** Amount in minor units (kobo) */
  amount: number;
  currency: string;
  reference: string;
  type: 'credit' | 'debit';
  category: TransactionCategoryValue;
  /** Balance in minor units after the mutation */
  balanceAfter: number;
  traceId: string;
}

/** Emitted when a wallet reservation is created, captured, released, or expired. */
export interface ReservationEventPayload {
  userId: string;
  walletId: string;
  reservationId: string;
  /** Amount in minor units (kobo) */
  amount: number;
  currency: string;
  reservationType: ReservationType;
  traceId: string;
}

/** Emitted by the risk engine after evaluating a transaction. */
export interface RiskEventPayload {
  userId: string;
  /** Amount in minor units (kobo) */
  amount: number;
  currency: string;
  decision: RiskDecision;
  score: number;
  reasons: string[];
  relatedReference: string;
  traceId: string;
}

/** Emitted when a payment provider's health status changes. */
export interface ProviderEventPayload {
  providerName: string;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  traceId: string;
}

/** Emitted to request sending a notification to a user. */
export interface NotificationEventPayload {
  userId: string;
  type: string;
  data: Record<string, unknown>;
  traceId: string;
}

// ---------------------------------------------------------------------------
// EventMap — maps event names to their payload types
// ---------------------------------------------------------------------------

export interface EventMap {
  // Deposits
  'deposit.initialized': DepositEventPayload;
  'deposit.completed': DepositEventPayload;
  'deposit.failed': DepositEventPayload;

  // Withdrawals
  'withdrawal.requested': WithdrawalEventPayload;
  'withdrawal.approved': WithdrawalEventPayload;
  'withdrawal.completed': WithdrawalEventPayload;
  'withdrawal.rejected': WithdrawalEventPayload;

  // Wallet mutations
  'wallet.credited': WalletEventPayload;
  'wallet.debited': WalletEventPayload;

  // Reservations
  'reservation.created': ReservationEventPayload;
  'reservation.captured': ReservationEventPayload;
  'reservation.released': ReservationEventPayload;
  'reservation.expired': ReservationEventPayload;

  // Risk
  'risk.allowed': RiskEventPayload;
  'risk.flagged': RiskEventPayload;
  'risk.blocked': RiskEventPayload;

  // Provider health
  'provider.healthy': ProviderEventPayload;
  'provider.degraded': ProviderEventPayload;
  'provider.unhealthy': ProviderEventPayload;
  'provider.recovered': ProviderEventPayload;

  // Notifications (internal dispatch)
  'notification.requested': NotificationEventPayload;
}

/** Union of all valid event names. */
export type EventName = keyof EventMap;
