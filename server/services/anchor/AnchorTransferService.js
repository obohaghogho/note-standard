'use strict';
/**
 * AnchorTransferService.js
 * ========================
 * Domestic and international payout execution with settlement tracking.
 * Every transfer creates a settlement_position record for lifecycle tracking.
 *
 * @module services/anchor/AnchorTransferService
 */

const logger              = require('../../utils/logger');
const supabase            = require('../../config/database');
const AnchorService       = require('./AnchorService');
const ImmutableAuditLog   = require('../treasury/ImmutableAuditLog');
const SettlementCalendar  = require('../treasury/SettlementCalendar');

const AnchorTransferService = {
  /**
   * Initiate a transfer (domestic payout via NIP or international).
   * Creates a settlement_position for lifecycle tracking.
   */
  async initiateTransfer(params, correlationId) {
    const {
      userId, amount, currency = 'NGN',
      accountNumber, bankCode, accountName,
      narration, reference,
    } = params;

    logger.info(`[AnchorTransfer] Initiating ${amount} ${currency} → ${accountNumber} (ref: ${reference})`);

    // ── 1. Execute transfer ───────────────────────────────────────────────────
    const result = await AnchorService.initiateTransfer({
      userId, amount, currency, accountNumber, bankCode, accountName, narration, reference,
    });

    // ── 2. Compute expected settlement date ───────────────────────────────────
    let expectedSettlement;
    try {
      expectedSettlement = await SettlementCalendar.getExpectedDate('anchor', currency);
    } catch {
      expectedSettlement = null;
    }

    // ── 3. Create settlement position ────────────────────────────────────────
    const positionPayload = {
      correlation_id:      correlationId || null,
      transaction_id:      reference,
      provider:            'anchor',
      provider_reference:  result?.id || result?.reference || reference,
      currency:            String(currency).toUpperCase(),
      gross_amount:        parseFloat(amount),
      fee_amount:          0,
      settlement_stage:    'PENDING_SETTLEMENT',
      expected_settlement: expectedSettlement?.toISOString() || null,
      metadata:            { accountNumber, bankCode, narration, anchorResult: result },
    };

    const { data: position } = await supabase
      .from('settlement_positions')
      .insert(positionPayload)
      .select('id')
      .single()
      .catch(e => {
        logger.warn(`[AnchorTransfer] Settlement position insert failed: ${e.message}`);
        return { data: null };
      });

    // Transition log
    if (position?.id) {
      await supabase.from('settlement_position_transitions').insert({
        position_id:     position.id,
        from_stage:      null,
        to_stage:        'PENDING_SETTLEMENT',
        transitioned_by: 'AnchorTransferService',
        reason:          'Transfer initiated via Anchor',
      }).catch(() => {});
    }

    // ── 4. Audit log ──────────────────────────────────────────────────────────
    await ImmutableAuditLog.record({
      event_type:   'ANCHOR_TRANSFER_INITIATED',
      actor_type:   'USER',
      actor_id:     userId || 'SYSTEM',
      subject_type: 'TRANSFER',
      subject_id:   correlationId || reference,
      reason:       `Anchor payout: ${amount} ${currency} → ${accountNumber}`,
      metadata:     { correlationId, reference, amount, currency, accountNumber, bankCode },
    }).catch(() => {});

    logger.info(`[AnchorTransfer] Transfer initiated: ${result?.id || reference} | Settlement position: ${position?.id}`);

    return {
      success:          true,
      provider:         'anchor',
      reference:        result?.reference || reference,
      providerReference: result?.id || result?.reference,
      settlementPositionId: position?.id || null,
      expectedSettlement: expectedSettlement?.toISOString() || null,
      raw:              result,
    };
  },

  /**
   * Get the status of a transfer from Anchor API.
   */
  async getTransferStatus(reference) {
    const AnchorProvider = require('../payment/providers/AnchorProvider');
    const provider = new AnchorProvider();
    provider.assertEnabled();

    try {
      const response = await provider.client.get(`/transfers/${reference}`);
      const data     = response.data?.data || response.data || {};
      return {
        reference,
        status:    (data.status || '').toLowerCase(),
        amount:    data.amount ? data.amount / 100 : null,
        currency:  data.currency || 'NGN',
        raw:       data,
      };
    } catch (err) {
      logger.error(`[AnchorTransfer] getTransferStatus failed: ${err.message}`);
      throw err;
    }
  },

  /**
   * Reverse a transfer (if supported by Anchor for the reference).
   */
  async reverseTransfer(reference, reason) {
    logger.warn(`[AnchorTransfer] Reversing transfer: ${reference}`);
    const AnchorProvider = require('../payment/providers/AnchorProvider');
    const provider = new AnchorProvider();
    const result = await provider.reverse(reference, reason);

    // Update settlement position to REVERSED
    await supabase
      .from('settlement_positions')
      .update({ settlement_stage: 'REVERSED', reversal_reason: reason, updated_at: new Date().toISOString() })
      .eq('provider_reference', reference)
      .eq('provider', 'anchor')
      .catch(() => {});

    return result;
  },

  /**
   * Mark a settlement position as SETTLED (called by AnchorWebhookService).
   */
  async markSettled(reference, settlementReference) {
    await supabase
      .from('settlement_positions')
      .update({
        settlement_stage:    'SETTLED',
        actual_settlement:   new Date().toISOString(),
        settlement_reference: settlementReference || null,
        updated_at:          new Date().toISOString(),
      })
      .eq('provider_reference', reference)
      .eq('provider', 'anchor')
      .catch(e => logger.warn(`[AnchorTransfer] markSettled failed: ${e.message}`));
  },
};

module.exports = AnchorTransferService;
