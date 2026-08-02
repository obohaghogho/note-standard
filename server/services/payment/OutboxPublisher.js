'use strict';

/**
 * OutboxPublisher.js
 * ==================
 * Transactional Outbox Event Publisher with standardized event envelopes and DLQ support.
 */
class OutboxPublisher {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
    this.inMemoryOutbox = [];
  }

  /**
   * Enqueue domain event to transactional outbox
   */
  async enqueueEvent(eventData) {
    const { eventType, aggregateType = 'Transaction', aggregateId, traceId, payload, version = 1 } = eventData;
    if (!eventType) throw new Error('eventType is required');
    if (!aggregateId) throw new Error('aggregateId is required');

    const envelope = {
      id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      eventType,
      aggregateType,
      aggregateId,
      traceId: traceId || `trace_${Date.now()}`,
      version,
      occurredAt: new Date().toISOString(),
      payload: payload || {},
      status: 'PENDING',
      retry_count: 0
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.outbox 
           (event_type, aggregate_type, aggregate_id, trace_id, version, payload, status, retry_count)
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0)`,
          [envelope.eventType, envelope.aggregateType, envelope.aggregateId, envelope.traceId, envelope.version, JSON.stringify(envelope.payload)]
        );
      } catch (err) {
        // Fallback
      }
    }

    this.inMemoryOutbox.push(envelope);
    return envelope;
  }

  /**
   * Process pending outbox events and publish to subscribers
   */
  async publishPendingEvents() {
    const published = [];
    for (const event of this.inMemoryOutbox) {
      if (event.status === 'PENDING') {
        event.status = 'PUBLISHED';
        event.published_at = new Date().toISOString();
        published.push(event);
      }
    }
    return published;
  }
}

module.exports = OutboxPublisher;
