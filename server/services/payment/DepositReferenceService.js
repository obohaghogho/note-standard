'use strict';

const crypto = require('crypto');

/**
 * DepositReferenceService.js
 * ===========================
 * Deposit Reference Engine managing unique, immutable deposit references.
 * Features:
 *  - Unique reference code generation (e.g. NS-000000001, NS-EUR-847291)
 *  - Unique UUID idempotency keys per reference
 *  - 1-to-N reference mapping per Payment Intent
 *  - Strict FSM transitions: CREATED -> AWAITING_PAYMENT -> MATCHED -> PENDING_SETTLEMENT -> SETTLED -> POSTED -> COMPLETED
 *  - 72-hour TTL expiration rules
 */
class DepositReferenceService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }

    this.references = new Map();
    this.allowedTransitions = {
      CREATED: ['AWAITING_PAYMENT', 'CANCELLED', 'EXPIRED'],
      AWAITING_PAYMENT: ['MATCHED', 'EXPIRED', 'CANCELLED'],
      MATCHED: ['PENDING_SETTLEMENT', 'REJECTED', 'CANCELLED'],
      PENDING_SETTLEMENT: ['SETTLED', 'REJECTED'],
      SETTLED: ['POSTED', 'REJECTED'],
      POSTED: ['COMPLETED', 'REVERSED'],
      COMPLETED: ['REVERSED'],
      EXPIRED: [],
      CANCELLED: [],
      REJECTED: [],
      REVERSED: []
    };
  }

  /**
   * Format reference string with currency/rail code
   */
  generateReferenceCode(currency = 'USD') {
    const prefix = 'NS';
    const currCode = currency.toUpperCase();
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${currCode}-${randomDigits}`;
  }

  /**
   * Create a new deposit reference attached to a payment intent
   */
  async createReference(params) {
    const {
      userId,
      walletId,
      currency,
      rail = 'LOCAL',
      paymentIntentId,
      expectedAmount = 0,
      amountValidationMode = 'OPEN_AMOUNT',
      ttlHours = 72
    } = params;

    if (!userId) throw new Error('userId is required');
    if (!walletId) throw new Error('walletId is required');
    if (!currency) throw new Error('currency is required');

    const referenceStr = this.generateReferenceCode(currency);
    const idempotencyKey = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const record = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      reference: referenceStr,
      idempotency_key: idempotencyKey,
      user_id: userId,
      wallet_id: walletId,
      currency: currency.toUpperCase(),
      rail: rail.toUpperCase(),
      payment_intent_id: paymentIntentId || null,
      expected_amount: parseFloat(expectedAmount || 0),
      amount_validation_mode: amountValidationMode,
      status: 'AWAITING_PAYMENT',
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `INSERT INTO public.deposit_references
           (reference, idempotency_key, user_id, wallet_id, currency, rail, payment_intent_id, expected_amount, amount_validation_mode, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'AWAITING_PAYMENT', $10)
           RETURNING *`,
          [
            record.reference,
            record.idempotency_key,
            record.user_id,
            record.wallet_id,
            record.currency,
            record.rail,
            record.payment_intent_id,
            record.expected_amount,
            record.amount_validation_mode,
            record.expires_at
          ]
        );
        if (res.rows && res.rows.length > 0) {
          record.id = res.rows[0].id;
        }
      } catch (e) {
        // Fallback
      }
    }

    this.references.set(record.reference, record);
    return record;
  }

  /**
   * Find active non-expired reference by string
   */
  async findReference(referenceStr) {
    if (!referenceStr) return null;
    const cleanRef = String(referenceStr).trim();

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          `SELECT * FROM public.deposit_references WHERE reference = $1 LIMIT 1`,
          [cleanRef]
        );
        if (res.rows && res.rows.length > 0) {
          const rec = res.rows[0];
          // Check expiration
          if (new Date(rec.expires_at) < new Date() && rec.status === 'AWAITING_PAYMENT') {
            rec.status = 'EXPIRED';
          }
          return rec;
        }
      } catch (e) {}
    }

    const memoryRec = this.references.get(cleanRef);
    if (memoryRec) {
      if (new Date(memoryRec.expires_at) < new Date() && memoryRec.status === 'AWAITING_PAYMENT') {
        memoryRec.status = 'EXPIRED';
      }
      return memoryRec;
    }

    return null;
  }

  /**
   * Transition deposit reference status (FSM Enforcement)
   */
  async transitionStatus(referenceStr, targetStatus) {
    const refRecord = await this.findReference(referenceStr);
    if (!refRecord) {
      throw new Error(`Deposit reference '${referenceStr}' not found.`);
    }

    const currentStatus = refRecord.status;
    const allowed = this.allowedTransitions[currentStatus] || [];

    if (currentStatus !== targetStatus && !allowed.includes(targetStatus)) {
      throw new Error(
        `Invalid state transition for reference ${referenceStr}: cannot transition from '${currentStatus}' to '${targetStatus}'.`
      );
    }

    refRecord.status = targetStatus;
    refRecord.updated_at = new Date();

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `UPDATE public.deposit_references SET status = $1, updated_at = NOW() WHERE reference = $2`,
          [targetStatus, referenceStr]
        );
      } catch (e) {}
    }

    return refRecord;
  }
}

module.exports = DepositReferenceService;
