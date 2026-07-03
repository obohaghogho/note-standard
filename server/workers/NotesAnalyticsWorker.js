const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
});

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
  logger.info("[NotesAnalyticsWorker] Started background analytics scheduler.");
  // Run every 10 seconds
  setInterval(processAnalytics, 10000);
}

module.exports = {
  start,
  processAnalytics
};
