'use strict';
/**
 * AnchorWebhookService.js
 * =======================
 * Processes inbound Anchor webhook events.
 * Routes to the appropriate domain handler based on event type.
 * Records every event to ImmutableAuditLog.
 *
 * @module services/anchor/AnchorWebhookService
 */

const logger                = require('../../utils/logger');
const supabase              = require('../../config/database');
const ImmutableAuditLog     = require('../treasury/ImmutableAuditLog');
const AnchorTransferService = require('./AnchorTransferService');

const AnchorWebhookService = {
  /**
   * Entry point: verify signature and dispatch event.
   */
  async processEvent(headers, rawBody, parsedBody) {
    // ── 1. Signature validation ───────────────────────────────────────────────
    const AnchorProvider = require('../payment/providers/AnchorProvider');
    const provider = new AnchorProvider();
    const isValid = provider.verifyWebhookSignature(headers, parsedBody, rawBody);

    if (!isValid) {
      logger.warn('[AnchorWebhook] Signature verification FAILED — rejecting event');
      return { accepted: false, reason: 'INVALID_SIGNATURE' };
    }

    // ── 2. Parse event ────────────────────────────────────────────────────────
    const parsed = provider.parseWebhookEvent(parsedBody);
    const { type, reference, status, amount, currency, raw } = parsed;

    logger.info(`[AnchorWebhook] Event: ${parsedBody.event} | ref=${reference} | status=${status}`);

    // ── 3. Audit record (always, before any processing) ───────────────────────
    await ImmutableAuditLog.record({
      event_type:   `ANCHOR_WEBHOOK_${(parsedBody.event || 'UNKNOWN').toUpperCase().replace('.', '_')}`,
      actor_type:   'PROVIDER',
      actor_id:     'anchor',
      subject_type: type === 'PAYOUT' ? 'TRANSFER' : 'DEPOSIT',
      subject_id:   reference || 'UNKNOWN',
      reason:       `Anchor webhook: ${parsedBody.event}`,
      metadata:     { parsed, raw },
    }).catch(() => {});

    // ── 4. Route to handler ───────────────────────────────────────────────────
    const event = (parsedBody.event || '').toLowerCase();

    if (event.includes('transfer')) {
      await this._handleTransferEvent(event, parsed);
    } else if (event.includes('deposit') || event.includes('collection')) {
      await this._handleDepositEvent(event, parsed);
    } else {
      logger.info(`[AnchorWebhook] Unhandled event type: ${event}`);
    }

    return { accepted: true, reference, type, status };
  },

  // ── Event Handlers ────────────────────────────────────────────────────────────

  async _handleTransferEvent(event, parsed) {
    const { reference, status } = parsed;

    if (status === 'success') {
      await AnchorTransferService.markSettled(reference, reference);
    } else if (status === 'failed') {
      await supabase
        .from('settlement_positions')
        .update({
          settlement_stage: 'FAILED',
          failure_reason:   `Anchor webhook: ${event}`,
          updated_at:       new Date().toISOString(),
        })
        .eq('provider_reference', reference)
        .eq('provider', 'anchor')
        .catch(() => {});
    } else if (status === 'reversed') {
      await supabase
        .from('settlement_positions')
        .update({
          settlement_stage: 'REVERSED',
          updated_at:       new Date().toISOString(),
        })
        .eq('provider_reference', reference)
        .eq('provider', 'anchor')
        .catch(() => {});
    }

    logger.info(`[AnchorWebhook] Transfer ${reference} → stage updated to ${status}`);
  },

  async _handleDepositEvent(event, parsed) {
    const { reference, amount, currency, accountNumber, customerCode } = parsed;

    // Record incoming deposit in treasury_incoming_deposits (if table exists)
    await supabase
      .from('anchor_incoming_deposits')
      .upsert({
        reference,
        amount,
        currency:        String(currency).toUpperCase(),
        account_number:  accountNumber || null,
        customer_code:   customerCode || null,
        status:          parsed.status,
        provider:        'anchor',
        received_at:     new Date().toISOString(),
      }, { onConflict: 'reference' })
      .catch(e => logger.warn(`[AnchorWebhook] anchor_incoming_deposits upsert failed: ${e.message}`));

    logger.info(`[AnchorWebhook] Deposit recorded: ${amount} ${currency} ref=${reference}`);
  },
};

module.exports = AnchorWebhookService;
