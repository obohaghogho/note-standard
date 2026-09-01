const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function inspect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('=== SUPABASE SECURITY AUDIT ===\n');

    // 1. Tables without RLS
    const noRlsRes = await client.query(`
      SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity = false
      ORDER BY c.relname;
    `);

    console.log(`[1] TABLES WITH RLS DISABLED (${noRlsRes.rows.length}):`);
    noRlsRes.rows.forEach(r => console.log(`  - ${r.table_name}`));

    // 2. Sensitive columns check across public schema
    const sensitiveRes = await client.query(`
      SELECT 
        table_name, 
        column_name, 
        data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND (
          column_name ILIKE '%password%' OR 
          column_name ILIKE '%secret%' OR 
          column_name ILIKE '%token%' OR 
          column_name ILIKE '%key%' OR 
          column_name ILIKE '%bvn%' OR 
          column_name ILIKE '%nin%' OR 
          column_name ILIKE '%ssn%' OR 
          column_name ILIKE '%phone%' OR 
          column_name ILIKE '%email%' OR 
          column_name ILIKE '%pin%' OR 
          column_name ILIKE '%balance%' OR 
          column_name ILIKE '%private%' OR 
          column_name ILIKE '%credential%'
        )
      ORDER BY table_name, column_name;
    `);

    console.log(`\n[2] SENSITIVE COLUMNS FOUND IN PUBLIC SCHEMA (${sensitiveRes.rows.length} columns):`);
    const sensitiveByTable = {};
    sensitiveRes.rows.forEach(r => {
      if (!sensitiveByTable[r.table_name]) sensitiveByTable[r.table_name] = [];
      sensitiveByTable[r.table_name].push(r.column_name);
    });

    Object.keys(sensitiveByTable).forEach(t => {
      const isRlsOff = noRlsRes.rows.some(r => r.table_name === t);
      console.log(`  - Table '${t}' ${isRlsOff ? '⚠️ RLS DISABLED!' : '✅ RLS ENABLED'}: [${sensitiveByTable[t].join(', ')}]`);
    });

    // 3. Check public & anon grants
    const anonGrantsRes = await client.query(`
      SELECT DISTINCT 
        grantee, 
        table_name, 
        string_agg(privilege_type, ', ') AS privileges
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon', 'public')
      GROUP BY grantee, table_name
      ORDER BY table_name, grantee;
    `);

    console.log(`\n[3] PERMISSIONS GRANTED TO 'anon' OR 'public' (${anonGrantsRes.rows.length}):`);
    anonGrantsRes.rows.forEach(r => {
      console.log(`  - ${r.table_name} -> ${r.grantee}: ${r.privileges}`);
    });

    // 4. Default privileges for anon
    const defPrivRes = await client.query(`
      SELECT 
        defaclrole::regrole AS owner,
        defaclnamespace::regnamespace AS schema,
        defaclacl
      FROM pg_default_acl
      WHERE defaclnamespace = 'public'::regnamespace;
    `);

    console.log(`\n[4] DEFAULT PRIVILEGES IN PUBLIC SCHEMA:`);
    defPrivRes.rows.forEach(r => {
      console.log(`  - Owner: ${r.owner}, ACL: ${JSON.stringify(r.defaclacl)}`);
    });

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await client.end();
  }
}

inspect();
