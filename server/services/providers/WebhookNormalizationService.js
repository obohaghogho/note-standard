'use strict';

/**
 * WebhookNormalizationService.js
 * ================================
 * Normalizes raw external provider webhook payloads into unified NoteStandard domain event envelopes.
 */
class WebhookNormalizationService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
  }

  /**
   * Normalize provider webhook payload to common domain event model
   */
  normalizeWebhook(provider, rawPayload = {}, headers = {}) {
    const p = (provider || 'fincra').toLowerCase();
    let normalizedEventType = 'UNKNOWN';
    let providerReference = null;
    let currency = 'NGN';
    let amount = 0;
    let eventId = null;

    if (p === 'fincra') {
      const event = rawPayload.event || rawPayload.eventType || 'charge.successful';
      if (event === 'charge.successful') normalizedEventType = 'DepositSucceeded';
      else if (event === 'payout.successful') normalizedEventType = 'WithdrawalCompleted';
      
      providerReference = rawPayload.data?.reference || rawPayload.reference || `FIN_${Date.now()}`;
      currency = rawPayload.data?.currency || rawPayload.currency || 'NGN';
      amount = parseFloat(rawPayload.data?.amount || rawPayload.amount || 0);
      eventId = rawPayload.eventId || `evt_fincra_${Date.now()}`;
    } else if (p === 'anchor') {
      const event = rawPayload.event || 'payment.settled';
      if (event === 'payment.settled') normalizedEventType = 'DepositSucceeded';
      else if (event === 'transfer.completed') normalizedEventType = 'WithdrawalCompleted';

      providerReference = rawPayload.reference || `ANC_${Date.now()}`;
      currency = rawPayload.currency || 'USD';
      amount = parseFloat(rawPayload.amount || 0);
      eventId = rawPayload.id || `evt_anchor_${Date.now()}`;
    } else if (p === 'conduit') {
      const event = rawPayload.type || 'transaction.completed';
      if (event === 'transaction.completed') normalizedEventType = 'DepositSucceeded';
      else if (event === 'disbursement.settled') normalizedEventType = 'WithdrawalCompleted';

      providerReference = rawPayload.transaction_id || `CND_${Date.now()}`;
      currency = rawPayload.currency || 'EUR';
      amount = parseFloat(rawPayload.amount || 0);
      eventId = rawPayload.event_id || `evt_conduit_${Date.now()}`;
    }

    return {
      provider: p,
      eventId,
      normalizedEventType,
      providerReference,
      currency: currency.toUpperCase(),
      amount,
      rawPayload,
      receivedAt: new Date().toISOString()
    };
  }
}

module.exports = WebhookNormalizationService;
