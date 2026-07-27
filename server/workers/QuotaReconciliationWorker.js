const pool = require("../config/pgPool");
const logger = require("../utils/logger");

class QuotaReconciliationWorker {
  constructor() {
    this.interval = null;
    this.INTERVAL_MS = 6 * 60 * 60 * 1000; // Run every 6 hours
  }

  start() {
    logger.info("[QuotaReconciliationWorker] Starting background quota reconciliation worker...");
    // Run initial reconciliation 30s after startup
    setTimeout(() => this.reconcileQuotas(), 30000);
    this.interval = setInterval(() => this.reconcileQuotas(), this.INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("[QuotaReconciliationWorker] Worker stopped.");
    }
  }

  async reconcileQuotas() {
    const t0 = Date.now();
    logger.info("[QuotaReconciliationWorker] Running scheduled quota reconciliation...");

    try {
      // 1. Reconcile Note Counts
      const noteRes = await pool.query(`
        WITH actual_notes AS (
          SELECT owner_id, COUNT(*)::int AS count
          FROM notes
          WHERE deleted_at IS NULL
          GROUP BY owner_id
        )
        UPDATE profiles p
        SET note_count = COALESCE(an.count, 0)
        FROM (
          SELECT id, COALESCE(an.count, 0) AS count
          FROM profiles p
          LEFT JOIN actual_notes an ON p.id = an.owner_id
        ) an
        WHERE p.id = an.id AND p.note_count IS DISTINCT FROM an.count
        RETURNING p.id, p.note_count;
      `);

      const repairedNoteCounts = noteRes.rowCount || 0;

      // 2. Reconcile Storage Usage Bytes
      const storageRes = await pool.query(`
        WITH actual_storage AS (
          SELECT n.owner_id, COALESCE(SUM(nf.file_size), 0)::bigint AS bytes
          FROM note_files nf
          JOIN notes n ON nf.note_id = n.id
          GROUP BY n.owner_id
        )
        UPDATE profiles p
        SET storage_used_bytes = COALESCE(ast.bytes, 0)
        FROM (
          SELECT p.id, COALESCE(ast.bytes, 0) AS bytes
          FROM profiles p
          LEFT JOIN actual_storage ast ON p.id = ast.owner_id
        ) ast
        WHERE p.id = ast.id AND p.storage_used_bytes IS DISTINCT FROM ast.bytes
        RETURNING p.id, p.storage_used_bytes;
      `);

      const repairedStorageCounts = storageRes.rowCount || 0;
      const durationMs = Date.now() - t0;

      logger.info(`[QuotaReconciliationWorker] Reconciliation complete (${durationMs}ms). Repaired note_counts: ${repairedNoteCounts}, storage_bytes: ${repairedStorageCounts}`);
    } catch (err) {
      logger.error(`[QuotaReconciliationWorker] Reconciliation error: ${err.message}`);
      await this.logDeadLetter("QUOTA_RECONCILIATION_ERROR", err.message, { stack: err.stack });
    }
  }

  async logDeadLetter(type, message, metadata = {}) {
    try {
      await pool.query(
        `INSERT INTO dead_letter_logs (error_type, message, metadata, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [type, message, JSON.stringify(metadata)]
      ).catch(() => {
        // Fallback log if table not created
        logger.warn(`[DeadLetter] ${type}: ${message}`);
      });
    } catch (e) {
      logger.error(`[DeadLetter] Failed to insert log: ${e.message}`);
    }
  }
}

module.exports = new QuotaReconciliationWorker();
