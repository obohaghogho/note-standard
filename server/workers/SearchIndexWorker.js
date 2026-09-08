const logger = require("../utils/logger");
const pool = require("../config/pgPool");

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
  const intervalMs = parseInt(process.env.WORKER_SEARCH_INDEX_INTERVAL_MS || '600000', 10);
  logger.info(`[SearchIndexWorker] Started background search index validator (interval: ${intervalMs / 1000}s).`);
  // Run every 10 minutes by default
  setInterval(verifySearchIndices, intervalMs);
}

module.exports = {
  start,
  verifySearchIndices
};
