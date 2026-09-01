const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function inspectDisabled() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    const noRlsRes = await client.query(`
      SELECT 
        c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity = false
      ORDER BY c.relname;
    `);

    console.log(`[1] TABLES WITH RLS DISABLED (${noRlsRes.rows.length}):`);
    noRlsRes.rows.forEach(r => console.log(`  - ${r.table_name}`));

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await client.end();
  }
}

inspectDisabled();
