// ============================================================================
// Notification Service — In-app notifications via Supabase Realtime
// ============================================================================
// Phase 1: In-app notifications only (stored in DB, broadcast via Realtime)
// Future: Add email, push notifications, SMS
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Send a notification to a user.
   * Currently stores in DB for Realtime subscription.
   */
  async send(payload: NotificationPayload): Promise<void> {
    try {
      // Insert to a notifications table (could be created later)
      // For now, we broadcast via Supabase Realtime channel
      const channel = this.supabase.channel(`user:${payload.userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'notification',
        payload: {
          type: payload.type,
          title: payload.title,
          message: payload.message,
          data: payload.data,
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`[Notification] Sent "${payload.type}" to user ${payload.userId}`);
    } catch (err) {
      // Notifications should never break operations
      console.error('[NotificationService] Failed to send notification:', err);
    }
  }

  /** Send a deposit completed notification */
  async notifyDepositCompleted(
    userId: string,
    amount: number,
    currency: string,
    reference: string,
  ): Promise<void> {
    await this.send({
      userId,
      type: 'deposit.completed',
      title: 'Deposit Received',
      message: `Your deposit of ${amount} ${currency} has been received.`,
      data: { amount, currency, reference },
    });
  }

  /** Send a withdrawal update notification */
  async notifyWithdrawalUpdate(
    userId: string,
    status: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const titles: Record<string, string> = {
      approved: 'Withdrawal Approved',
      completed: 'Withdrawal Completed',
      rejected: 'Withdrawal Rejected',
      failed: 'Withdrawal Failed',
    };

    await this.send({
      userId,
      type: `withdrawal.${status}`,
      title: titles[status] || 'Withdrawal Update',
      message: `Your withdrawal of ${amount} ${currency} has been ${status}.`,
      data: { status, amount, currency },
    });
  }

  /** Send a risk alert notification */
  async notifyRiskAlert(
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.send({
      userId,
      type: 'risk.alert',
      title: 'Security Alert',
      message: reason,
    });
  }
}
