'use strict';
/**
 * WebhookReplayService.js
 * =======================
 * Replays failed or missing webhooks from stored raw payloads.
 * Designed for disaster recovery, event reconciliation, and debugging.
 *
 * Strategy:
 *   1. Store every inbound raw webhook to `webhook_events` table (idempotency_key = provider+event_id)
 *   2. After replay, mark event as `replayed`
 *   3. Supports filtering by provider, date range, status, event type
 *   4. Implements configurable delay between replays (rate-limiting)
 *
 * Table schema required (webhook_events):
 *   id            UUID primary key
 *   provider      text (fincra | paystack | anchor | grey | nowpayments)
 *   event_type    text
 *   event_id      text  (unique per provider)
 *   raw_payload   JSONB
 *   status        text  (RECEIVED | PROCESSED | FAILED | REPLAYED)
 *   received_at   timestamptz
 *   processed_at  timestamptz
 *   error         text
 *
 * @module services/payment/WebhookReplayService
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// Webhook handlers (lazy-loaded to avoid circular deps)
const HANDLER_MAP = {
  fincra:      () => require('../fincra/webhookHandler'),
  paystack:    () => require('./paystackWebhookHandler'),
  anchor:      () => require('../anchor/AnchorWebhookHandler'),
  grey:        () => require('../grey/greyWebhookHandler'),
  nowpayments: () => require('./nowpaymentsWebhookHandler'),
};

// Configurable replay delay to avoid rate-limit exhaustion
const REPLAY_DELAY_MS = parseInt(process.env.WEBHOOK_REPLAY_DELAY_MS || '500', 10);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const WebhookReplayService = {
  /**
   * Store a raw inbound webhook event.
   * Called by each webhook route before processing.
   *
   * @param {Object} params
   * @param {string}  params.provider
   * @param {string}  params.eventType
   * @param {string}  params.eventId    - Unique ID from provider (e.g. payment.id)
   * @param {Object}  params.rawPayload
   * @returns {Promise<{ stored: boolean, id: string }>}
   */
  async store({ provider, eventType, eventId, rawPayload }) {
    const key = `${provider}_${eventId}`;

    // Idempotent: skip if already stored
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', key)
      .maybeSingle();

    if (existing) return { stored: false, id: existing.id, duplicate: true };

    const { data, error } = await supabase
      .from('webhook_events')
      .insert({
        provider,
        event_type:  eventType,
        event_id:    key,
        raw_payload: rawPayload,
        status:      'RECEIVED',
        received_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      logger.warn(`[WebhookReplayService] Store failed for ${provider}/${eventId}: ${error.message}`);
      return { stored: false, error: error.message };
    }

    return { stored: true, id: data.id };
  },

  /**
   * Mark a webhook event as PROCESSED or FAILED.
   * Called after webhook processing completes.
   *
   * @param {string} eventId    - DB id (UUID)
   * @param {'PROCESSED'|'FAILED'} status
   * @param {string} [error]
   */
  async markProcessed(eventId, status, error) {
    await supabase
      .from('webhook_events')
      .update({
        status,
        processed_at: new Date().toISOString(),
        error: error || null,
      })
      .eq('id', eventId)
      .catch(e => logger.warn(`[WebhookReplayService] markProcessed failed: ${e.message}`));
  },

  /**
   * Replay webhook events matching a filter.
   * Dispatches each stored payload to the appropriate handler.
   *
   * @param {Object} filter
   * @param {string}   [filter.provider]
   * @param {string}   [filter.eventType]
   * @param {string}   [filter.status]      - Filter by status (e.g. 'FAILED')
   * @param {string}   [filter.from]        - ISO date lower bound
   * @param {string}   [filter.to]          - ISO date upper bound
   * @param {number}   [filter.limit]       - Max events to replay (default 100)
   * @param {string}   [filter.requestedBy] - Admin user ID for audit trail
   * @returns {Promise<{ replayed: number, failed: number, results: Array }>}
   */
  async replay(filter = {}) {
    let query = supabase
      .from('webhook_events')
      .select('*')
      .order('received_at', { ascending: true })
      .limit(filter.limit || 100);

    if (filter.provider)   query = query.eq('provider', filter.provider);
    if (filter.eventType)  query = query.eq('event_type', filter.eventType);
    if (filter.status)     query = query.eq('status', filter.status);
    if (filter.from)       query = query.gte('received_at', filter.from);
    if (filter.to)         query = query.lte('received_at', filter.to);

    const { data: events, error } = await query;

    if (error) throw new Error(`[WebhookReplayService] Fetch failed: ${error.message}`);
    if (!events?.length) return { replayed: 0, failed: 0, results: [], note: 'No events matched filter' };

    logger.info(`[WebhookReplayService] Replaying ${events.length} events (requestedBy=${filter.requestedBy || 'system'})`);

    let replayed = 0;
    let failed   = 0;
    const results = [];

    for (const event of events) {
      await sleep(REPLAY_DELAY_MS);

      const result = await this._dispatchEvent(event);
      results.push({ event_id: event.event_id, provider: event.provider, ...result });

      if (result.success) {
        replayed++;
        await supabase.from('webhook_events')
          .update({ status: 'REPLAYED', processed_at: new Date().toISOString() })
          .eq('id', event.id)
          .catch(() => null);
      } else {
        failed++;
        await supabase.from('webhook_events')
          .update({ status: 'FAILED', error: result.error })
          .eq('id', event.id)
          .catch(() => null);
      }
    }

    logger.info(`[WebhookReplayService] Replay complete: ${replayed} replayed, ${failed} failed`);
    return { replayed, failed, total: events.length, results };
  },

  /**
   * Dispatch a single stored webhook event to its handler.
   * @private
   */
  async _dispatchEvent(event) {
    const loaderFn = HANDLER_MAP[event.provider];
    if (!loaderFn) {
      return { success: false, error: `No handler registered for provider: ${event.provider}` };
    }

    try {
      const handler = loaderFn();
      // Handlers typically export processWebhook(payload) or handleEvent(payload)
      const fn = handler.processWebhook || handler.handleEvent || handler.process;
      if (typeof fn !== 'function') {
        return { success: false, error: `Handler for ${event.provider} has no callable method` };
      }
      await fn.call(handler, event.raw_payload);
      return { success: true };
    } catch (e) {
      logger.warn(`[WebhookReplayService] Dispatch failed for ${event.event_id}: ${e.message}`);
      return { success: false, error: e.message };
    }
  },

  /**
   * Returns a summary of webhook event counts by status and provider.
   * Useful for the admin monitoring dashboard.
   *
   * @param {Object} [filter] - Optional date range { from, to }
   */
  async getSummary(filter = {}) {
    let query = supabase
      .from('webhook_events')
      .select('provider, status, count:id.count()');

    if (filter.from) query = query.gte('received_at', filter.from);
    if (filter.to)   query = query.lte('received_at', filter.to);

    const { data, error } = await query;
    if (error) return { error: error.message };

    return {
      summary:     data || [],
      retrieved_at: new Date().toISOString(),
    };
  },
};

module.exports = WebhookReplayService;
