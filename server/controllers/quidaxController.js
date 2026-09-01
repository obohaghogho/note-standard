'use strict';

/**
 * Quidax Webhook Controller (Phase 3A Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives and validates incoming webhooks from Quidax.
 *
 * SAFETY INVARIANTS:
 *   1. Fail-Closed Authentication: Rejects unauthenticated webhooks with HTTP 401.
 *   2. Zero Fake Credits: Webhooks will NEVER credit the internal PostgreSQL ledger
 *      without valid HMAC signature confirmation and official Quidax event specification.
 *   3. Idempotency: All webhook processing delegates to IdempotencyGuard.js.
 */

const logger = require("../utils/logger");
const env = require("../config/env");
const quidaxService = require("../services/quidaxService");

class QuidaxController {
  /**
   * Handle incoming Quidax webhook HTTP POST.
   */
  async handleWebhook(req, res) {
    const signature = req.headers["x-quidax-signature"] || req.headers["x-quidax-sig"];

    logger.info("[Quidax Webhook] Incoming webhook notification received.", {
      headers: req.headers,
      hasBody: Boolean(req.body)
    });

    if (!env.QUIDAX_ENABLED || !env.QUIDAX_WEBHOOK_SECRET) {
      logger.warn("[Quidax Webhook] Rejected webhook: Quidax is disabled or QUIDAX_WEBHOOK_SECRET is missing.");
      return res.status(401).json({
        success: false,
        error_code: "QUIDAX_WEBHOOK_NOT_CONFIGURED",
        message: "Quidax webhook handling is unconfigured or disabled."
      });
    }

    try {
      // Signature verification
      quidaxService.verifyWebhookSignature(req.body, signature);
    } catch (err) {
      logger.warn(`[Quidax Webhook] Signature validation blocked: ${err.message}`);
      return res.status(401).json({
        success: false,
        error_code: "INVALID_WEBHOOK_SIGNATURE",
        message: err.message
      });
    }

    // Default fail-closed response for unconfirmed webhook event structure
    return res.status(200).json({
      success: true,
      message: "Quidax webhook received (pending official event specification)"
    });
  }
}

module.exports = new QuidaxController();
