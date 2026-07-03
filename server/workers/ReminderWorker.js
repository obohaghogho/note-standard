const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
});

async function processReminders() {
  try {
    // 1. Find active reminders that are due and not completed
    const { rows: dueReminders } = await pool.query(
      `SELECT id, owner_id, title, reminder_at, repeat_type 
       FROM notes 
       WHERE deleted_at IS NULL 
       AND reminder_at <= NOW() 
       AND reminder_completed = false
       LIMIT 50`
    );

    if (dueReminders.length === 0) return;

    logger.info(`[ReminderWorker] Processing ${dueReminders.length} due reminders...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const note of dueReminders) {
        // A. Insert in-app notification
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, channel, delivery_status) 
           VALUES ($1, $2, $3, $4, 'in-app', 'pending')`,
          [
            note.owner_id, 
            "note_reminder", 
            "Note Reminder", 
            `Reminder for your note: "${note.title || 'Untitled note'}" is due.`
          ]
        );

        // B. Update reminder status / recurrence
        let nextReminder = null;
        let isCompleted = true;

        if (note.repeat_type && note.repeat_type !== 'none') {
          isCompleted = false;
          const current = new Date(note.reminder_at);
          if (note.repeat_type === 'daily') current.setDate(current.getDate() + 1);
          if (note.repeat_type === 'weekly') current.setDate(current.getDate() + 7);
          if (note.repeat_type === 'monthly') current.setMonth(current.getMonth() + 1);
          if (note.repeat_type === 'yearly') current.setFullYear(current.getFullYear() + 1);
          nextReminder = current;
        }

        await client.query(
          `UPDATE notes 
           SET reminder_completed = $1, reminder_at = $2 
           WHERE id = $3`,
          [isCompleted, nextReminder, note.id]
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
    logger.error("[ReminderWorker] Processing failed:", err.message);
  }
}

function start() {
  logger.info("[ReminderWorker] Started background reminders scheduler.");
  // Run every 15 seconds
  setInterval(processReminders, 15000);
}

module.exports = {
  start,
  processReminders
};
