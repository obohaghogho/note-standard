// ============================================================================
// Event Subscribers — wires domain events to audit + notifications
// ============================================================================
// Registers all default event subscriptions on the provided EventBus.
// Services are passed in to keep this module decoupled from concrete
// implementations (dependency injection).
// ============================================================================

import type { EventBus } from './event-bus';
import type {
  DepositEventPayload,
  WithdrawalEventPayload,
  ReservationEventPayload,
  RiskEventPayload,
  ProviderEventPayload,
  WalletEventPayload,
} from './types';

// ---------------------------------------------------------------------------
// Service Interfaces — contracts that future implementations must satisfy
// ---------------------------------------------------------------------------

/** Minimal interface for the audit-logging service. */
export interface IAuditService {
  /**
   * Persist an audit log entry.
   *
   * @param action       - Machine-readable action name, e.g. "deposit.completed".
   * @param resourceType - The type of resource affected, e.g. "wallet".
   * @param resourceId   - The id of the affected resource.
   * @param actorId      - The id of the actor (user / system).
   * @param metadata     - Arbitrary context attached to the log entry.
   */
  log(
    action: string,
    resourceType: string,
    resourceId: string,
    actorId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
}

/** Minimal interface for the notification service. */
export interface INotificationService {
  /**
   * Dispatch a notification to a user.
   *
   * @param userId - Target user.
   * @param type   - Notification type key, e.g. "deposit.completed".
   * @param data   - Payload forwarded to the notification template.
   */
  send(
    userId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers — build plain-object metadata from typed payloads
// ---------------------------------------------------------------------------

function depositMeta(d: DepositEventPayload): Record<string, unknown> {
  return {
    walletId: d.walletId,
    amount: d.amount,
    currency: d.currency,
    reference: d.reference,
    provider: d.provider,
    channel: d.channel,
    traceId: d.traceId,
  };
}

function withdrawalMeta(w: WithdrawalEventPayload): Record<string, unknown> {
  return {
    walletId: w.walletId,
    amount: w.amount,
    currency: w.currency,
    reference: w.reference,
    requestId: w.requestId,
    destinationType: w.destinationType,
    provider: w.provider,
    traceId: w.traceId,
  };
}

function reservationMeta(r: ReservationEventPayload): Record<string, unknown> {
  return {
    walletId: r.walletId,
    reservationId: r.reservationId,
    amount: r.amount,
    currency: r.currency,
    reservationType: r.reservationType,
    traceId: r.traceId,
  };
}

function riskMeta(r: RiskEventPayload): Record<string, unknown> {
  return {
    amount: r.amount,
    currency: r.currency,
    decision: r.decision,
    score: r.score,
    reasons: r.reasons,
    relatedReference: r.relatedReference,
    traceId: r.traceId,
  };
}

function providerMeta(p: ProviderEventPayload): Record<string, unknown> {
  return {
    providerName: p.providerName,
    status: p.status,
    consecutiveFailures: p.consecutiveFailures,
    traceId: p.traceId,
  };
}

function walletMeta(w: WalletEventPayload): Record<string, unknown> {
  return {
    walletId: w.walletId,
    amount: w.amount,
    currency: w.currency,
    reference: w.reference,
    type: w.type,
    category: w.category,
    balanceAfter: w.balanceAfter,
    traceId: w.traceId,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Wire all domain-event subscribers onto the given event bus.
 *
 * Call this once at application startup after constructing the audit and
 * notification service instances.
 *
 * @param bus                 - The application EventBus instance.
 * @param auditService        - Audit logging implementation.
 * @param notificationService - Notification dispatch implementation.
 */
export function registerSubscribers(
  bus: EventBus,
  auditService: IAuditService,
  notificationService: INotificationService,
): void {
  // ---- Deposits -----------------------------------------------------------

  bus.on('deposit.completed', async (data) => {
    await auditService.log(
      'deposit.completed',
      'wallet',
      data.walletId,
      data.userId,
      depositMeta(data),
    );
    await notificationService.send(data.userId, 'deposit.completed', depositMeta(data));
  });

  bus.on('deposit.failed', async (data) => {
    await auditService.log(
      'deposit.failed',
      'wallet',
      data.walletId,
      data.userId,
      depositMeta(data),
    );
    await notificationService.send(data.userId, 'deposit.failed', depositMeta(data));
  });

  // ---- Withdrawals --------------------------------------------------------

  bus.on('withdrawal.requested', async (data) => {
    await auditService.log(
      'withdrawal.requested',
      'withdrawal',
      data.requestId,
      data.userId,
      withdrawalMeta(data),
    );
  });

  bus.on('withdrawal.approved', async (data) => {
    await auditService.log(
      'withdrawal.approved',
      'withdrawal',
      data.requestId,
      data.userId,
      withdrawalMeta(data),
    );
    await notificationService.send(data.userId, 'withdrawal.approved', withdrawalMeta(data));
  });

  bus.on('withdrawal.completed', async (data) => {
    await auditService.log(
      'withdrawal.completed',
      'withdrawal',
      data.requestId,
      data.userId,
      withdrawalMeta(data),
    );
    await notificationService.send(data.userId, 'withdrawal.completed', withdrawalMeta(data));
  });

  bus.on('withdrawal.rejected', async (data) => {
    await auditService.log(
      'withdrawal.rejected',
      'withdrawal',
      data.requestId,
      data.userId,
      withdrawalMeta(data),
    );
    await notificationService.send(data.userId, 'withdrawal.rejected', withdrawalMeta(data));
  });

  // ---- Wallet mutations ---------------------------------------------------

  bus.on('wallet.credited', async (data) => {
    await notificationService.send(data.userId, 'wallet.credited', walletMeta(data));
  });

  bus.on('wallet.debited', async (data) => {
    await notificationService.send(data.userId, 'wallet.debited', walletMeta(data));
  });

  // ---- Reservations -------------------------------------------------------

  bus.on('reservation.created', async (data) => {
    await auditService.log(
      'reservation.created',
      'reservation',
      data.reservationId,
      data.userId,
      reservationMeta(data),
    );
  });

  bus.on('reservation.expired', async (data) => {
    await auditService.log(
      'reservation.expired',
      'reservation',
      data.reservationId,
      data.userId,
      reservationMeta(data),
    );
  });

  // ---- Risk ---------------------------------------------------------------

  bus.on('risk.blocked', async (data) => {
    await auditService.log(
      'risk.blocked',
      'risk',
      data.relatedReference,
      data.userId,
      riskMeta(data),
    );
    await notificationService.send(data.userId, 'risk.blocked', riskMeta(data));
  });

  // ---- Provider health ----------------------------------------------------

  bus.on('provider.unhealthy', async (data) => {
    await auditService.log(
      'provider.unhealthy',
      'provider',
      data.providerName,
      'system',
      providerMeta(data),
    );
  });

  bus.on('provider.recovered', async (data) => {
    await auditService.log(
      'provider.recovered',
      'provider',
      data.providerName,
      'system',
      providerMeta(data),
    );
  });
}
