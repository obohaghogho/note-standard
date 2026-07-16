const supabase = require("../config/database");
const logger = require("../utils/logger");
const sendgridEmailService = require("../services/sendgridEmailService");

/**
 * Payment Expiry Worker
 *
 * Runs on a fixed interval to expire pending Grey payments
 * that have exceeded their payment window (default: 60 minutes).
 *
 * Actions:
 * 1. Calls the expire_pending_payments() RPC to mark old payments as failed
 * 2. Sends expiration notification emails to affected users
 * 3. Logs all expirations for audit
 *
 * This worker runs in-process using setInterval (no Redis dependency).
 * For production scale, consider a dedicated cron service.
 */

const INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const DEFAULT_EXPIRY_MINUTES = parseInt(
  process.env.GREY_EXPIRY_MINUTES || "60",
  10
);

let intervalId = null;

/**
 * Execute one expiry sweep
 */
async function runExpirySweep() {
  try {
    // 1. Call the DB function to expire pending payments
    const { data, error } = await supabase.rpc("expire_pending_payments", {
      p_expiry_minutes: DEFAULT_EXPIRY_MINUTES,
    });

    if (error) {
      // If the RPC doesn't exist yet (migration not applied), use direct query
      if (error.message?.includes("does not exist")) {
        return await runDirectExpiry();
      }
      logger.error("[PaymentExpiry] RPC error:", error.message);
      return;
    }

    // The RPC returns { expired_count, expired_references }
    const result = data?.[0] || data || {};
    const expiredCount = result.expired_count || 0;
    const expiredRefs = result.expired_references || [];

    if (expiredCount > 0) {
      logger.info(
        `[PaymentExpiry] Expired ${expiredCount} pending payments:`,
        expiredRefs
      );

      // 2. Send notification emails for each expired payment
      for (const reference of expiredRefs) {
        try {
          await notifyExpiredPayment(reference);
        } catch (notifyErr) {
          logger.error(
            `[PaymentExpiry] Failed to notify for ${reference}:`,
            notifyErr.message
          );
        }
      }
    }
  } catch (error) {
    logger.error("[PaymentExpiry] Sweep failed:", error.message);
  }
}

/**
 * Direct query fallback if RPC doesn't exist
 */
async function runDirectExpiry() {
  try {
    const cutoff = new Date(
      Date.now() - DEFAULT_EXPIRY_MINUTES * 60 * 1000
    ).toISOString();

    // Find payments that should expire
    const { data: expiring } = await supabase
      .from("payments")
      .select("reference, user_id, amount, currency")
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (!expiring || expiring.length === 0) return;

    // Expire them
    const { error } = await supabase
      .from("payments")
      .update({
        status: "failed",
        metadata: {
          expiry_reason: `Auto-expired after ${DEFAULT_EXPIRY_MINUTES} minutes`,
          expired_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (error) {
      logger.error("[PaymentExpiry] Direct expiry error:", error.message);
      return;
    }

    logger.info(
      `[PaymentExpiry] Expired ${expiring.length} payments (direct method)`
    );

    // Also expire corresponding transactions
    for (const payment of expiring) {
      await supabase
        .from("transactions")
        .update({
          status: "FAILED",
          metadata: {
            expiry_reason: `Auto-expired after ${DEFAULT_EXPIRY_MINUTES} minutes`,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("reference_id", payment.reference)
        .eq("status", "PENDING")
        .catch(() => {});

      // Notify user
      try {
        await notifyExpiredPayment(payment.reference);
      } catch {
        // Non-critical
      }
    }
  } catch (error) {
    logger.error("[PaymentExpiry] Direct fallback failed:", error.message);
  }
}

/**
 * Send expiration notification to the user
 */
async function notifyExpiredPayment(reference) {
  // Fetch payment details with user email
  const { data: payment } = await supabase
    .from("payments")
    .select("amount, currency, user_id")
    .eq("reference", reference)
    .single();

  if (!payment) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", payment.user_id)
    .single();

  if (!profile?.email) return;

  // Send email
  await sendgridEmailService.sendPaymentExpiredNotification(profile.email, {
    amount: payment.amount,
    currency: payment.currency,
    reference,
  });

  // Create in-app notification
  try {
    const { createNotification } = require("../services/notificationService");
    await createNotification({
      receiverId: payment.user_id,
      type: "payment_expired",
      title: "Payment Expired",
      message: `Your pending bank transfer of ${payment.currency} ${payment.amount} (ref: ${reference}) has expired. Please initiate a new deposit.`,
      link: "/dashboard/wallet",
    });
  } catch {
    // Non-critical
  }
}

/**
 * Start the expiry worker
 */
function start() {
  if (intervalId) {
    logger.warn("[PaymentExpiry] Worker already running");
    return;
  }

  logger.info(
    `[PaymentExpiry] Started. Checking every ${INTERVAL_MS / 1000}s, expiring after ${DEFAULT_EXPIRY_MINUTES}min`
  );

  // Run immediately once, then on interval
  runExpirySweep();
  intervalId = setInterval(runExpirySweep, INTERVAL_MS);
}

/**
 * Stop the expiry worker
 */
function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[PaymentExpiry] Worker stopped");
  }
}

module.exports = { start, stop, runExpirySweep };
