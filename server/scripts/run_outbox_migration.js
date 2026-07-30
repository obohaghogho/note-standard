require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require('fs');
const path = require('path');
const pool = require('../config/pgPool');

async function runOutboxMigration() {
  console.log("=== Running Migration 276: Transactional Outbox Pattern ===");
  try {
    const sqlPath = path.join(__dirname, '../database/migrations/276_crypto_outbox_pattern.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log("✓ Migration 276 applied successfully! Table crypto_outbox_events ready.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runOutboxMigration();
