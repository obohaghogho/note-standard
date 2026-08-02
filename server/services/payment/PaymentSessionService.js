'use strict';

/**
 * PaymentSessionService.js
 * =========================
 * Service for append-only provider checkout session rotation (v1..vN).
 * Preserves full checkout history without overwriting session records.
 */
class PaymentSessionService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    this.inMemorySessions = new Map();
  }

  /**
   * Create or rotate checkout session for a payment intent
   */
  async createSession(sessionData) {
    const { intentId, provider, checkoutUrl, providerReference, providerSessionId } = sessionData;
    if (!intentId) throw new Error('intentId is required');

    // Determine current version number for session rotation
    let currentVersion = 1;
    for (const [id, session] of this.inMemorySessions.entries()) {
      if (session.intent_id === intentId) {
        currentVersion = Math.max(currentVersion, session.session_version + 1);
      }
    }

    const sessionRecord = {
      id: `psess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      intent_id: intentId,
      session_version: currentVersion,
      provider: provider || 'fincra',
      checkout_url: checkoutUrl || null,
      provider_reference: providerReference || null,
      provider_session_id: providerSessionId || null,
      expires_at: new Date(Date.now() + 3600000),
      status: 'ACTIVE',
      created_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `INSERT INTO public.payment_sessions 
           (intent_id, session_version, provider, checkout_url, provider_reference, provider_session_id, expires_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
           RETURNING *`,
          [sessionRecord.intent_id, sessionRecord.session_version, sessionRecord.provider, sessionRecord.checkout_url, sessionRecord.provider_reference, sessionRecord.provider_session_id, sessionRecord.expires_at]
        );
        if (res.rows && res.rows.length > 0) {
          sessionRecord.id = res.rows[0].id;
        }
      } catch (err) {
        // Fallback
      }
    }

    this.inMemorySessions.set(sessionRecord.id, sessionRecord);
    return sessionRecord;
  }
}

module.exports = PaymentSessionService;
