/**
 * Fincra Integration — Structured Financial Audit Logger
 * ───────────────────────────────────────────────────────
 * Appends an immutable audit record to fincra_audit_logs for every
 * Fincra-originated financial action.
 *
 * Every payout attempt, webhook receipt, account resolution, and conversion
 * request is traceable through this module.
 */

const supabase = require("../../config/database");
const logger   = require("../../utils/logger");

/**
 * Record a Fincra financial audit event.
 *
 * @param {object} params
 * @param {string} params.action   - Action identifier (e.g. "DEPOSIT_WEBHOOK_RECEIVED")
 * @param {string|null} params.userId - NoteStandard user UUID (can be null for system events)
 * @param {object} params.details  - Arbitrary JSONB details payload
 */
async function recordFincraAudit({ action, userId = null, details = {} }) {
  try {
    const { error } = await supabase.from("fincra_audit_logs").insert({
      action,
      user_id: userId,
      details: {
        ...details,
        _timestamp: new Date().toISOString(),
      },
    });

    if (error) {
      logger.error(`[Fincra/audit] Failed to write audit log: ${error.message}`, { action, userId });
    } else {
      logger.info(`[Fincra/audit] ${action}`, { userId, ...details });
    }
  } catch (err) {
    // Audit failure must NEVER block financial operations
    logger.error(`[Fincra/audit] Unexpected audit logging error: ${err.message}`, { action });
  }
}

module.exports = { recordFincraAudit };
