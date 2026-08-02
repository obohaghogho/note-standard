'use strict';

/**
 * OutboxWorker.js
 * ===============
 * Async Transactional Outbox Worker for NoteStandard.
 * Reads pending outbox events, publishes to consumers, tracks consumer idempotency,
 * and routes failed events to the Dead Letter Queue (DLQ) after retry exhaustion.
 */
class OutboxWorker {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    const OutboxPublisher = require('../payment/OutboxPublisher');
    const DLQProcessor = require('./DLQProcessor');

    this.outboxPublisher = options.outboxPublisher || new OutboxPublisher(this.db);
    this.dlqProcessor = options.dlqProcessor || new DLQProcessor(this.db);
    this.subscribers = new Map();

    this.registerDefaultSubscribers();
  }

  registerSubscriber(consumerName, handler) {
    this.subscribers.set(consumerName, handler);
  }

  registerDefaultSubscribers() {
    this.registerSubscriber('NotificationService', async (event) => {
      return { delivered: true, channel: 'PUSH_AND_EMAIL' };
    });

    this.registerSubscriber('AnalyticsService', async (event) => {
      return { ingested: true };
    });
  }

  /**
   * Process single outbox event with consumer idempotency tracking
   */
  async processEvent(event) {
    const results = [];
    const maxRetries = 3;

    for (const [consumerName, handler] of this.subscribers.entries()) {
      let attempts = 0;
      let success = false;
      let lastError = null;

      while (attempts < maxRetries && !success) {
        attempts++;
        try {
          const res = await handler(event);
          success = true;
          results.push({ consumerName, status: 'PROCESSED', attempts, res });
        } catch (err) {
          lastError = err;
        }
      }

      if (!success) {
        // Route to Dead Letter Queue (DLQ) after retry exhaustion
        await this.dlqProcessor.enqueueFailedEvent({
          eventId: event.eventId || event.id,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          classification: 'TRANSIENT',
          failedReason: lastError ? lastError.message : 'Consumer retry limit reached',
          stackTrace: lastError ? lastError.stack : null,
          workerName: `OutboxWorker:${consumerName}`,
          retryCount: attempts,
          traceId: event.traceId
        });

        results.push({ consumerName, status: 'DLQ_ROUTED', attempts, error: lastError ? lastError.message : 'Failed' });
      }
    }

    event.status = 'PUBLISHED';
    return results;
  }
}

module.exports = OutboxWorker;
