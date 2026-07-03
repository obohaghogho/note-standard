const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
});

async function verifySearchIndices() {
  try {
    // Re-verify notes with empty search_vector (if trigger missed it, or on batch updates)
    const { rows: emptyVectors } = await pool.query(
      `SELECT id, title, content FROM notes 
       WHERE search_vector IS NULL 
       AND deleted_at IS NULL 
       LIMIT 100`
    );

    if (emptyVectors.length === 0) return;

    logger.info(`[SearchIndexWorker] Rebuilding search vectors for ${emptyVectors.length} notes...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const note of emptyVectors) {
        await client.query(
          `UPDATE notes SET search_vector = 
             setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
             setweight(to_tsvector('english', coalesce(content, '')), 'B')
           WHERE id = $1`,
          [note.id]
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
    logger.error("[SearchIndexWorker] Verification failed:", err.message);
  }
}

function start() {
  logger.info("[SearchIndexWorker] Started background search index validator.");
  // Run every 60 seconds (since trigger handles active entries)
  setInterval(verifySearchIndices, 60000);
}

module.exports = {
  start,
  verifySearchIndices
};
