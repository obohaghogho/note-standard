const logger = require("../utils/logger");
const pool = require("../config/pgPool");

async function processAnalytics() {
  try {
    // 1. Find notes that need word count / reading time calculation (word_count is null or 0 but content exists)
    const { rows: pendingNotes } = await pool.query(
      `SELECT id, content FROM notes 
       WHERE deleted_at IS NULL 
       AND (word_count IS NULL OR word_count = 0) 
       AND content IS NOT NULL AND content != '' 
       LIMIT 50`
    );

    if (pendingNotes.length === 0) return;

    logger.info(`[NotesAnalyticsWorker] Processing metrics for ${pendingNotes.length} notes...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const note of pendingNotes) {
        const words = note.content.trim().split(/\s+/).filter(Boolean).length;
        // Average reading speed = 200 words per minute. Convert to seconds.
        const readingTimeSeconds = Math.max(1, Math.round((words / 200) * 60));

        await client.query(
          "UPDATE notes SET word_count = $1, reading_time = $2 WHERE id = $3",
          [words, readingTimeSeconds, note.id]
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
    logger.error("[NotesAnalyticsWorker] Processing failed:", err.message);
  }
}

function start() {
  const intervalMs = parseInt(process.env.WORKER_NOTES_ANALYTICS_INTERVAL_MS || '300000', 10);
  logger.info(`[NotesAnalyticsWorker] Started background analytics scheduler (interval: ${intervalMs / 1000}s).`);
  // Run every 5 minutes by default to conserve database Disk I/O budget
  setInterval(processAnalytics, intervalMs);
}

module.exports = {
  start,
  processAnalytics
};
