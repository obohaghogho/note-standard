'use strict';
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function probe() {
  // Check actual columns of the settlements table via information_schema
  const { data: cols, error: colErr } = await supabase.rpc('query_raw', {
    sql: `SELECT column_name, data_type, udt_name, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'settlements'
          ORDER BY ordinal_position;`
  });
  if (colErr) {
    // Fallback: just select with limit
    const { data, error } = await supabase.from('settlements').select('*').limit(0);
    console.log('settlements (select probe):', { data, error: error?.message });
    return;
  }
  console.log('settlements columns:', JSON.stringify(cols, null, 2));

  // Check for unique constraints
  const { data: constraints } = await supabase.rpc('query_raw', {
    sql: `SELECT conname, contype, pg_get_constraintdef(oid) as def
          FROM pg_constraint
          WHERE conrelid = 'public.settlements'::regclass;`
  });
  console.log('settlements constraints:', JSON.stringify(constraints, null, 2));
}

probe().catch(console.error);
