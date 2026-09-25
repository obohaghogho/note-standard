'use strict';
/**
 * apply_migration_408.js
 * Applies migration 408 (platform_settlements table + reserve_platform_revenue RPC)
 * to the production Supabase database.
 *
 * Run once. Idempotent (uses CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function apply() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../database/migrations/408_platform_settlements_table.sql'),
    'utf8'
  );
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[Migration 408] ✅ Applied successfully: platform_settlements table + reserve_platform_revenue() RPC created.');
  } catch (err) {
    console.error('[Migration 408] ❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

apply().catch(err => { console.error(err.message); process.exit(1); });
