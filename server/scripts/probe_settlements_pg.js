'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function probe() {
  const client = await pool.connect();
  try {
    // 1. Get all columns on settlements table
    const cols = await client.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settlements'
      ORDER BY ordinal_position
    `);
    console.log('\n=== settlements COLUMNS ===');
    cols.rows.forEach(r => console.log(`  ${r.column_name} | ${r.data_type}(${r.udt_name}) | nullable:${r.is_nullable} | default:${r.column_default}`));

    // 2. Get constraints
    const constr = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'public.settlements'::regclass
    `);
    console.log('\n=== settlements CONSTRAINTS ===');
    constr.rows.forEach(r => console.log(`  [${r.contype}] ${r.conname}: ${r.def}`));

    // 3. Get indexes
    const idx = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'settlements' AND schemaname = 'public'
    `);
    console.log('\n=== settlements INDEXES ===');
    idx.rows.forEach(r => console.log(`  ${r.indexname}: ${r.indexdef}`));

    // 4. Check platform_settlements table
    const pt = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_settlements'
      ORDER BY ordinal_position
    `);
    console.log('\n=== platform_settlements COLUMNS ===');
    if (pt.rows.length === 0) {
      console.log('  (table does not exist)');
    } else {
      pt.rows.forEach(r => console.log(`  ${r.column_name} | ${r.data_type}`));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

probe().catch(console.error);
