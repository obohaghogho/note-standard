/**
 * WebhookGateway.js
 * =================
 * Unified webhook ingestion layer.
 * All provider webhooks flow through here BEFORE any business logic is touched.
 *
 * Responsibilities:
 *   1. Signature verification (per adapter)
 *   2. Idempotency guard (prevent duplicate processing)
 *   3. Persistent webhook audit log
 *   4. HTTP 200 acknowledgement
 *   5. Background business logic dispatch via PaymentEventBus
 *
 * NoteStandard Financial Platform v4
 */

const supabase  = require('../../config/database');
const logger    = require('../../utils/logger');
const IdempotencyGuard = require('./IdempotencyGuard');
const AuditLogger = require('../audit/AuditLogger');
const PaymentEventBus  = require('./PaymentEventBus');
const GatewayRouter    = require('./GatewayRouter');

class WebhookGateway {
  /**
   * Main webhook ingestion handler — called by all provider webhook routes.
   *
   * @param {string}  providerName  - e.g. 'paystack', 'fincra', 'anchor'
   * @param {Object}  req           - Express request
   * @param {Object}  res           - Express response
   */
  async ingest(providerName, req, res) {
    const name = String(providerName).toLowerCase();

    try {
      logger.info(`[WebhookGateway] Ingestion start: ${name}`);

      // ─── 1. Get Adapter ───────────────────────────────────────────────
      let adapter;
      try {
        const { adapter: a } = GatewayRouter.selectBestGateway({ currency: 'USD', method: 'card' });
        // Lookup adapter by name directly
        adapter = this._getAdapterByName(name);
      } catch (err) {
        logger.error(`[WebhookGateway] No adapter for provider: ${name}`);
        return res.status(400).json({ error: `Unknown provider: ${name}` });
      }

      // ─── 2. Signature Verification (Hard Gate) ────────────────────────
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const signatureValid = adapter.verifyWebhookSignature(req.headers, rawBody);
      if (!signatureValid) {
        logger.warn(`[WebhookGateway] REJECTED — invalid signature: ${name}`);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      // ─── 3. Parse Event ───────────────────────────────────────────────
      let event;
      try {
        event = adapter.parseWebhookEvent(req.body);
      } catch (err) {
        logger.error(`[WebhookGateway] Parse error: ${name} — ${err.message}`);
        return res.status(400).json({ error: 'Malformed webhook payload' });
      }

      const eventId = event.reference || `wh_${Date.now()}`;

      // ─── 4. Audit Log (persistent) ────────────────────────────────────
      let logId;
      try {
        const { data: logEntry } = await supabase
          .from('webhook_logs')
          .insert({
            provider:   name,
            payload:    req.body,
            headers:    req.headers,
            reference:  eventId,
            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
          })
          .select('id')
          .single();
        logId = logEntry?.id;
      } catch (err) {
        logger.warn(`[WebhookGateway] webhook_logs write failed (non-blocking): ${err.message}`);
      }

      // ─── 5. HTTP 200 ACK ──────────────────────────────────────────────
      res.status(200).json({ received: true, eventId });

      // ─── 6. Background Processing (non-blocking) ──────────────────────
      setImmediate(async () => {
        try {
          // Idempotency guard
          const { wasDuplicate } = await IdempotencyGuard.guard(
            `webhook:${name}:${eventId}`,
            'webhook',
            async () => {
              // Dispatch to business logic via event bus
              PaymentEventBus.emit(`webhook.${event.type || 'unknown'}`, {
                provider: name,
                event,
                raw: req.body,
              });

              // Also dispatch generic 'webhook.received' for catch-all listeners
              PaymentEventBus.emit('webhook.received', { provider: name, event, raw: req.body });

              // Load paymentService for legacy webhook action compatibility
              try {
                const paymentService = require('./paymentService');
                await paymentService.executeWebhookAction(event, req.body, name);
              } catch (svcErr) {
                logger.error(`[WebhookGateway] paymentService dispatch error: ${svcErr.message}`);
              }

              return { processed: true };
            }
          );

          if (wasDuplicate) {
            logger.info(`[WebhookGateway] Duplicate webhook ignored: ${name}:${eventId}`);
            return;
          }

          // Mark log as processed
          if (logId) {
            await supabase.from('webhook_logs').update({ processed: true }).eq('id', logId);
          }

          await AuditLogger.success({
            action:    `webhook.${event.type || 'received'}`,
            service:   'WebhookGateway',
            provider:  name,
            reference: eventId,
            metadata:  { eventType: event.type, amount: event.amount, currency: event.currency },
          });

        } catch (bgErr) {
          logger.error(`[WebhookGateway] Background processing error: ${bgErr.message}`, { eventId });

          // DLQ
          try {
            await supabase.from('dead_letter_webhooks').insert({
              event_id:    eventId,
              job_id:      eventId,
              raw_payload: req.body,
              reason:      bgErr.message,
              failure_class: 'WEBHOOK_PROCESSING_ERROR',
            });
          } catch (dlqErr) {
            logger.error(`[WebhookGateway] DLQ write failed: ${dlqErr.message}`);
          }
        }
      });

    } catch (criticalErr) {
      logger.error(`[WebhookGateway] Critical ingestion failure: ${criticalErr.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Webhook ingestion failure' });
      }
    }
  }

  _getAdapterByName(name) {
    const map = {
      paystack:    () => require('./adapters/PaystackAdapter'),
      fincra:      () => require('./adapters/FincraAdapter'),
      grey:        () => require('./adapters/GreyAdapter'),
      anchor:      () => require('./adapters/AnchorAdapter'),
      nowpayments: () => require('./adapters/NowPaymentsAdapter'),
    };
    const loader = map[name];
    if (!loader) throw new Error(`[WebhookGateway] No adapter for: ${name}`);
    return loader();
  }
}

module.exports = new WebhookGateway();
