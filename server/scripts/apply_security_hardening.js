const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function applySecurityHardening() {
  const connStr = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connStr) {
    console.error('❌ Missing DATABASE_URL in environment');
    process.exit(1);
  }

  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    const sqlPath = path.join(__dirname, '../database/migrations/460_fix_supabase_rls_and_security_hardening.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔒 Applying Migration 460: Supabase Security Hardening & Full RLS Remediation...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 460 executed successfully!');

    // Re-audit RLS status
    const noRlsRes = await client.query(`
      SELECT relname 
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' 
        AND c.relkind = 'r' 
        AND c.relrowsecurity = false;
    `);

    console.log(`\n======================================================`);
    console.log(`RE-AUDIT RESULT: ${noRlsRes.rows.length} tables with RLS disabled.`);
    if (noRlsRes.rows.length === 0) {
      console.log('🎉 ALL TABLES IN PUBLIC SCHEMA ARE NOW HARDENED WITH RLS ENABLED!');
    } else {
      console.warn('⚠️ Remaining unprotected tables:', noRlsRes.rows.map(r => r.relname));
    }
    console.log(`======================================================\n`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applySecurityHardening();
