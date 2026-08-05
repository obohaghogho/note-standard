'use strict';

/**
 * server/services/payment/DepositSessionService.js
 * ===================================================
 * NoteStandard Provider-Independent Deposit Session Service.
 * Manages deposit sessions (`dep_01K...`), 24-hour expiration, and append-only
 * event logging (`deposit_session_events`).
 */

const supabase = require('../../config/database');
const logger = require('../../utils/logger');

class DepositSessionService {
  /**
   * Create a 24-hour NoteStandard Deposit Session
   */
  async createSession(userId, currency = 'NGN', userReference, expectedAmount = null) {
    const sessionId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const sessionObj = {
      session_id: sessionId,
      user_id: userId,
      currency: currency.toUpperCase(),
      expected_amount: expectedAmount,
      user_reference: userReference,
      status: 'CREATED',
      expires_at: expiresAt,
      provider_used: currency.toUpperCase() === 'NGN' ? 'fincra' : 'grey'
    };

    try {
      await supabase.from('deposit_sessions').insert(sessionObj);
    } catch (err) {
      logger.warn(`[DepositSessionService] DB insert warning: ${err.message}`);
    }

    await this.logEvent(sessionId, null, 'CREATED', 'SESSION_CREATED', '24h deposit session initialized');
    return sessionObj;
  }

  /**
   * Append an immutable event record to deposit_session_events
   */
  async logEvent(sessionId, previousStatus, newStatus, eventType, reason, actor = 'system') {
    try {
      await supabase.from('deposit_session_events').insert({
        session_id: sessionId,
        previous_status: previousStatus,
        new_status: newStatus,
        event_type: eventType,
        reason,
        actor
      });

      await supabase
        .from('deposit_sessions')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
    } catch (err) {
      logger.warn(`[DepositSessionService] Event log warning: ${err.message}`);
    }
  }

  /**
   * Transition session state with lifecycle validation & graceful expired review handling
   */
  async transitionState(sessionId, newStatus, reason, actor = 'system') {
    try {
      const { data: session } = await supabase
        .from('deposit_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (!session) return;

      const isExpired = new Date(session.expires_at).getTime() < Date.now();

      // Graceful Expired Session Review: If payment arrives after 24h expiration, route to MANUAL_REVIEW
      let targetStatus = newStatus;
      let finalReason = reason;

      if (isExpired && newStatus !== 'EXPIRED' && newStatus !== 'MANUAL_REVIEW') {
        targetStatus = 'MANUAL_REVIEW';
        finalReason = `Deposit arrived after 24h expiration window. Moved to manual review: ${reason}`;
      }

      await this.logEvent(sessionId, session.status, targetStatus, `TRANSITION_TO_${targetStatus}`, finalReason, actor);
      return { success: true, status: targetStatus };
    } catch (err) {
      logger.error(`[DepositSessionService] Transition error: ${err.message}`);
    }
  }
}

module.exports = new DepositSessionService();
