const supabase = require("../config/database");
const logger = require("../utils/logger");

/**
 * AuditLogService
 * Immutable audit trail for all financial operations.
 */
class AuditLogService {
  async log(data) {
    try {
      const payload = {
        user_id: data.user_id,
        action: data.action,
        ip_address: data.ip,
        device: data.device,
        provider: data.provider,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        ledger_id: data.ledger_id,
        webhook_id: data.webhook_id,
        previous_balance: data.previous_balance,
        new_balance: data.new_balance,
        created_at: new Date().toISOString()
      };

      // Depending on if the table exists, we might fall back to logging in a JSON payload
      // into an existing generic table like `webhook_logs` if `audit_logs` doesn't exist.
      // For now, assume `audit_logs` migration will be run.
      
      const { error } = await supabase.from("audit_logs").insert([payload]);
      
      if (error && error.code === '42P01') { 
        // Table doesn't exist yet, fallback to webhook_logs for safety
        await supabase.from("webhook_logs").insert([{
          provider: data.provider || "system",
          reference: data.reference || "audit",
          payload: payload,
          processing_error: "AuditLog fallback"
        }]);
      } else if (error) {
        logger.error("[AuditLogService] Failed to insert:", error);
      }
    } catch (e) {
      logger.error("[AuditLogService] Exception:", e);
    }
  }
}

module.exports = new AuditLogService();
