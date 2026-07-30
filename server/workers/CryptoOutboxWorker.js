'use strict';

/**
 * CryptoOutboxWorker
 * ==================
 * Implements the Transactional Outbox Pattern for the Crypto Ledger Engine.
 * Polling worker that fetches PENDING outbox events created atomically
 * inside database transactions and dispatches them to the Event Bus.
 * 
 * Guarantees zero ghost events on rollback and at-least-once event delivery.
 */

const pool = require('../config/pgPool');
const localEventBus = require('../services/events/LocalEventBus');
const logger = require('../utils/logger');

class CryptoOutboxWorker {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
    this.pollIntervalMs = 5000; // Poll every 5 seconds
    this.lastHeartbeat = Date.now();
  }

  start() {
    if (this.intervalId) return;
    logger.info("[CryptoOutboxWorker] Starting Transactional Outbox Polling Worker (5s interval)...");
    
    this.intervalId = setInterval(() => {
      this.processOutboxEvents().catch(err => {
        logger.error("[CryptoOutboxWorker] Outbox processing error:", err.message);
      });
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("[CryptoOutboxWorker] Outbox Worker stopped.");
    }
  }

  async processOutboxEvents() {
    this.lastHeartbeat = Date.now();
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Fetch up to 50 pending events
      const res = await pool.query(
        `SELECT id, event_name, aggregate_type, aggregate_id, payload, attempts
         FROM public.crypto_outbox_events
         WHERE status = 'PENDING' AND attempts < 5
         ORDER BY created_at ASC
         LIMIT 50
         FOR UPDATE SKIP LOCKED`
      );

      if (res.rows.length === 0) {
        this.isProcessing = false;
        return;
      }

      for (const eventRow of res.rows) {
        try {
          // Traceable Versioned Event Envelope (v1)
          const versionedEnvelope = {
            eventId: eventRow.id,
            eventVersion: 1,
            eventName: eventRow.event_name,
            aggregateType: eventRow.aggregate_type,
            aggregateId: eventRow.aggregate_id,
            correlationId: eventRow.payload?.correlationId || eventRow.aggregate_id,
            causationId: eventRow.payload?.causationId || eventRow.id,
            occurredAt: eventRow.created_at || new Date().toISOString(),
            payload: eventRow.payload
          };

          // Publish to Event Bus
          await localEventBus.publish(eventRow.event_name, versionedEnvelope);

          // Mark as published
          await pool.query(
            `UPDATE public.crypto_outbox_events
             SET status = 'PUBLISHED', published_at = NOW(), attempts = attempts + 1
             WHERE id = $1`,
            [eventRow.id]
          );

          logger.info(`[CryptoOutboxWorker] Event v1 published cleanly: ${eventRow.event_name} (Outbox ID: ${eventRow.id})`);
        } catch (pubErr) {
          const nextAttempts = eventRow.attempts + 1;
          const isDeadLetter = nextAttempts >= 5;
          const nextStatus = isDeadLetter ? 'DEAD_LETTER' : 'PENDING';

          await pool.query(
            `UPDATE public.crypto_outbox_events
             SET status = $1,
                 attempts = $2,
                 last_error = $3
             WHERE id = $4`,
            [nextStatus, nextAttempts, pubErr.message, eventRow.id]
          );
          
          if (isDeadLetter) {
            logger.error(`[CryptoOutboxWorker] Event ${eventRow.id} moved to DEAD_LETTER queue after 5 failed attempts.`);
          } else {
            logger.warn(`[CryptoOutboxWorker] Retry ${nextAttempts}/5 scheduled for event ${eventRow.id}: ${pubErr.message}`);
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Outbox Telemetry & Metrics
   */
  /**
   * Outbox Telemetry & Metrics
   */
  async getOutboxMetrics() {
    const res = await pool.query(
      `SELECT 
         status,
         COUNT(*) as count,
         MIN(created_at) as oldest_event_at
       FROM public.crypto_outbox_events
       GROUP BY status`
    );
    return res.rows;
  }

  /**
   * Worker Heartbeat Probe
   */
  getHeartbeat() {
    return {
      status: this.intervalId ? 'ACTIVE' : 'INACTIVE',
      lastHeartbeatAt: new Date(this.lastHeartbeat).toISOString(),
      ageSeconds: Math.round((Date.now() - this.lastHeartbeat) / 1000)
    };
  }
}

module.exports = new CryptoOutboxWorker();
