'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function probe() {
  const client = await pool.connect();
  try {
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'revenue_logs'
      ORDER BY ordinal_position
    `);
    console.log('\n=== revenue_logs COLUMNS ===');
    cols.rows.forEach(r => console.log(`  ${r.column_name} | ${r.data_type} | nullable:${r.is_nullable}`));
  } finally {
    client.release();
    await pool.end();
  }
}
probe().catch(console.error);
