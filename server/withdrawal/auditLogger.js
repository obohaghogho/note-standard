/**
 * Immutable Append-Only Audit Logger for Enterprise Payouts
 * ─────────────────────────────────────────────────────────
 * Banking Compliance Contract:
 *   - Audit logs are STRICTLY APPEND-ONLY (INSERT).
 *   - Updates and deletions are FORBIDDEN.
 *   - Captures actor (user_id), timestamp, action type, IP, device, and payload.
 */

const supabase = require("../config/database");
const logger   = require("../utils/logger");

/**
 * Record an immutable audit log entry.
 *
 * @param {object} params
 * @param {string} params.action     - e.g. "WITHDRAWAL_INITIATED", "PAYOUT_SENT", "WEBHOOK_PROCESSED"
 * @param {string} [params.userId]   - User ID or null for system events
 * @param {object} [params.details]  - JSON serializable context metadata
 */
async function recordAuditLog({ action, userId = null, details = {} }) {
  try {
    const payload = {
      action,
      user_id: userId,
      details: {
        ...details,
        timestamp: new Date().toISOString(),
        node_env: process.env.NODE_ENV || "development",
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("fincra_audit_logs").insert(payload);

    if (error) {
      logger.error(`[AuditLogger] Failed to write append-only audit log: ${error.message}`, { action, userId });
    } else {
      logger.info(`[AuditLogger] 📝 Append-only audit record created: ${action}`, { userId });
    }
  } catch (err) {
    logger.error(`[AuditLogger] Exception recording audit log: ${err.message}`, { action, userId });
  }
}

module.exports = { recordAuditLog };
