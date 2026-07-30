require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require('fs');
const path = require('path');
const pool = require('../config/pgPool');

async function runIntegrityMigration() {
  console.log("=== Running Migration 277: Crypto Ledger Integrity Proof Reports ===");
  try {
    const sqlPath = path.join(__dirname, '../database/migrations/277_crypto_integrity_reports.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log("✓ Migration 277 applied successfully! Table crypto_ledger_integrity_reports ready.");
  } catch (err) {
    console.error("❌ Migration 277 failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runIntegrityMigration();
