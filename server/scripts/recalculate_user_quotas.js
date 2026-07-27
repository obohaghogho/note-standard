/**
 * Script: recalculate_user_quotas.js
 * Purpose: Backfills and recalculates cached note_count and storage_used_bytes for all profiles
 * Source of Truth:
 *   - notes table (deleted_at IS NULL) -> note_count
 *   - note_files table -> storage_used_bytes
 */

const pool = require("../config/pgPool");
const fs = require("fs");
const path = require("path");

async function runQuotaMigrationAndBackfill() {
  console.log("[Backfill] Starting quota counters migration and backfill...");

  try {
    // 1. Apply Migration 232 SQL if needed
    const sqlPath = path.join(__dirname, "../database/migrations/232_subscription_quota_counters.sql");
    if (fs.existsSync(sqlPath)) {
      console.log("[Backfill] Applying migration 232_subscription_quota_counters.sql...");
      const sqlContent = fs.readFileSync(sqlPath, "utf8");
      await pool.query(sqlContent);
      console.log("[Backfill] Migration 232 executed successfully.");
    }

    // 2. Recalculate note_count per user
    console.log("[Backfill] Recalculating note_count for all users...");
    const noteCountsResult = await pool.query(`
      SELECT owner_id, COUNT(*)::int AS actual_count 
      FROM notes 
      WHERE deleted_at IS NULL 
      GROUP BY owner_id
    `);

    // Reset all note_count first
    await pool.query("UPDATE profiles SET note_count = 0");

    for (const row of noteCountsResult.rows) {
      await pool.query(
        "UPDATE profiles SET note_count = $1 WHERE id = $2",
        [row.actual_count, row.owner_id]
      );
    }
    console.log(`[Backfill] Updated note_count for ${noteCountsResult.rows.length} users with active notes.`);

    // 3. Recalculate storage_used_bytes per user
    console.log("[Backfill] Recalculating storage_used_bytes for all users...");
    const storageResult = await pool.query(`
      SELECT n.owner_id, COALESCE(SUM(nf.file_size), 0)::bigint AS actual_bytes
      FROM note_files nf
      JOIN notes n ON nf.note_id = n.id
      GROUP BY n.owner_id
    `);

    // Reset storage_used_bytes first
    await pool.query("UPDATE profiles SET storage_used_bytes = 0");

    for (const row of storageResult.rows) {
      await pool.query(
        "UPDATE profiles SET storage_used_bytes = $1 WHERE id = $2",
        [row.actual_bytes, row.owner_id]
      );
    }
    console.log(`[Backfill] Updated storage_used_bytes for ${storageResult.rows.length} users with files.`);

    console.log("[Backfill] ✅ Quota counters migration and backfill completed successfully!");
  } catch (err) {
    console.error("[Backfill] ❌ Error executing migration and backfill:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runQuotaMigrationAndBackfill();
}

module.exports = runQuotaMigrationAndBackfill;
