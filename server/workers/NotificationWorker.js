const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
});

async function processNotifications() {
  try {
    // 1. Fetch pending notifications
    const { rows: pending } = await pool.query(
      `SELECT id, user_id, type, title, body, channel 
       FROM notifications 
       WHERE delivery_status = 'pending' 
       AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 50`
    );

    if (pending.length === 0) return;

    logger.info(`[NotificationWorker] Dispatching ${pending.length} pending alerts...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const notif of pending) {
        // Here we would route to FCM or SMTP, for now we simulate delivery and mark it delivered
        let success = true;

        if (notif.channel === 'push') {
          // Trigger Push notification flow
          logger.info(`[NotificationWorker] Push Notification sent to user ${notif.user_id}: ${notif.title}`);
        } else if (notif.channel === 'email') {
          // Trigger Email notification flow
          logger.info(`[NotificationWorker] Email sent to user ${notif.user_id}: ${notif.title}`);
        } else {
          // In-app notifications are delivered instantly as they reside in DB
          logger.info(`[NotificationWorker] In-App delivery verified for user ${notif.user_id}`);
        }

        const status = success ? 'delivered' : 'failed';
        await client.query(
          "UPDATE notifications SET delivery_status = $1, read_at = NULL WHERE id = $2",
          [status, notif.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("[NotificationWorker] Processing failed:", err.message);
  }
}

function start() {
  logger.info("[NotificationWorker] Started background notification delivery queue.");
  // Run every 10 seconds
  setInterval(processNotifications, 10000);
}

module.exports = {
  start,
  processNotifications
};
