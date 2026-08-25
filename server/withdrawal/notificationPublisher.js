/**
 * Decoupled Notification Publisher
 * ─────────────────────────────────
 * Asynchronously queues and dispatches In-App notifications, Push notifications,
 * and Email receipts for withdrawal events without slowing down API responses.
 */

const supabase = require("../config/database");
const logger   = require("../utils/logger");

/**
 * Publish notification for a withdrawal event.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.type - 'SUCCESS' | 'FAILED' | 'REVERSED' | 'PENDING'
 * @param {number} params.amount
 * @param {string} params.currency
 * @param {string} params.reference
 * @param {string} [params.reason]
 */
async function publishWithdrawalNotification({ userId, type, amount, currency, reference, reason }) {
  try {
    let title = "Withdrawal Update";
    let message = `Your withdrawal of ${amount} ${currency} (ref: ${reference}) has been updated.`;

    if (type === "SUCCESS") {
      title = "Withdrawal Successful ✅";
      message = `Your bank transfer of ${amount} ${currency} was successful. Reference: ${reference}`;
    } else if (type === "FAILED" || type === "REVERSED") {
      title = "Withdrawal Failed ❌";
      message = `Your withdrawal of ${amount} ${currency} could not be processed and funds have been restored. ${reason ? `Reason: ${reason}` : ""}`;
    } else if (type === "PENDING") {
      title = "Withdrawal Processing ⏳";
      message = `Your withdrawal request of ${amount} ${currency} has been submitted to your bank.`;
    }

    // 1. Insert In-App Notification
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type: "withdrawal",
      data: { amount, currency, reference, status: type },
      read: false,
      created_at: new Date().toISOString(),
    });

    // 2. If status requires admin attention (PENDING / MANUAL_REVIEW / FAILED), alert all Admin Accounts
    if (type === "PENDING" || type === "MANUAL_REVIEW" || type === "FAILED") {
      try {
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, email")
          .or("role.eq.admin,role.eq.superadmin");

        if (admins && admins.length > 0) {
          const adminNotifications = admins.map(a => ({
            user_id: a.id,
            title: `[ADMIN ALERT] New Withdrawal Request ${type}`,
            message: `Withdrawal request of ${amount} ${currency} (ref: ${reference}) requires admin fulfillment/review.`,
            type: "admin_withdrawal_alert",
            data: { amount, currency, reference, status: type, requester_user_id: userId },
            read: false,
            created_at: new Date().toISOString(),
          }));

          await supabase.from("notifications").insert(adminNotifications);
          logger.info(`[NotificationPublisher] Dispatched admin withdrawal alert to ${admins.length} admin accounts.`);
        }
      } catch (adminErr) {
        logger.warn(`[NotificationPublisher] Admin notification warning: ${adminErr.message}`);
      }
    }

    logger.info(`[NotificationPublisher] Published in-app notification for user ${userId}: ${title}`);
  } catch (err) {
    logger.warn(`[NotificationPublisher] Non-fatal notification error: ${err.message}`);
  }
}

module.exports = { publishWithdrawalNotification };
