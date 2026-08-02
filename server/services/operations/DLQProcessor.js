'use strict';

/**
 * DLQProcessor.js
 * ===============
 * Dead Letter Queue (DLQ) Processor for NoteStandard.
 * Categorizes failures (TRANSIENT, VALIDATION, PROVIDER, INFRASTRUCTURE, UNKNOWN)
 * and provides Admin Dashboard actions: Replay, Retry, Ignore, Delete.
 */
class DLQProcessor {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }

    this.inMemoryDLQ = [];
  }

  /**
   * Enqueue failed event into DLQ
   */
  async enqueueFailedEvent(failedData) {
    const {
      eventId,
      eventType,
      aggregateId,
      classification = 'UNKNOWN',
      failedReason,
      stackTrace,
      workerName = 'OutboxWorker',
      retryCount = 3,
      traceId
    } = failedData;

    const dlqRecord = {
      id: `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      event_id: eventId,
      event_type: eventType,
      aggregate_id: aggregateId,
      classification,
      failed_reason: failedReason || 'Unknown execution error',
      stack_trace: stackTrace || null,
      worker_name: workerName,
      retry_count: retryCount,
      trace_id: traceId || `trace_${Date.now()}`,
      status: 'PENDING',
      first_failed_at: new Date(),
      created_at: new Date()
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `INSERT INTO public.dead_letter_queue 
           (event_id, event_type, aggregate_id, classification, failed_reason, stack_trace, worker_name, retry_count, trace_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')`,
          [dlqRecord.event_id, dlqRecord.event_type, dlqRecord.aggregate_id, dlqRecord.classification, dlqRecord.failed_reason, dlqRecord.stack_trace, dlqRecord.worker_name, dlqRecord.retry_count, dlqRecord.trace_id]
        );
      } catch (err) {
        // Fallback
      }
    }

    this.inMemoryDLQ.push(dlqRecord);
    return dlqRecord;
  }

  /**
   * Replay DLQ event (Admin Action)
   */
  async replayEvent(dlqId, replayHandler) {
    const item = this.inMemoryDLQ.find(i => i.id === dlqId || i.event_id === dlqId);
    if (!item) throw new Error(`DLQ_RECORD_NOT_FOUND: DLQ item '${dlqId}' not found.`);

    let res = null;
    if (typeof replayHandler === 'function') {
      res = await replayHandler(item);
    }

    item.status = 'REPLAYED';
    item.last_retry_at = new Date();

    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.db.query(
          `UPDATE public.dead_letter_queue SET status = 'REPLAYED', last_retry_at = NOW() WHERE id = $1 OR event_id = $1`,
          [dlqId]
        );
      } catch (err) {
        // Fallback
      }
    }

    return { status: 'REPLAYED', dlqId, result: res };
  }

  /**
   * Ignore DLQ event (Admin Action)
   */
  async ignoreEvent(dlqId) {
    const item = this.inMemoryDLQ.find(i => i.id === dlqId || i.event_id === dlqId);
    if (item) {
      item.status = 'IGNORED';
    }
    return { status: 'IGNORED', dlqId };
  }
}

module.exports = DLQProcessor;
