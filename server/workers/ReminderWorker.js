const logger = require("../utils/logger");
const pool = require("../config/pgPool");
const { createNotification } = require("../services/notificationService");

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
        // A. Update reminder status / recurrence
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

      // B. Dispatch notifications in real-time after commit
      for (const note of dueReminders) {
        await createNotification({
          receiverId: note.owner_id,
          senderId: null,
          type: "note_reminder",
          title: "Note Reminder",
          message: `Reminder for your note: "${note.title || 'Untitled note'}" is due.`,
          link: `/dashboard/notes`
        });
      }
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
