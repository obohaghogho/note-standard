require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log("Running migration 213...");
  
  // Since we don't have a direct SQL execution endpoint without psql, 
  // I will just use pg pool directly to execute the SQL.
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(':6543', ':5432'),
    ssl: { rejectUnauthorized: false }
  });
  
  const sql = fs.readFileSync('./database/migrations/214_push_health_status_view.sql', 'utf8');
  
  try {
    await pool.query(sql);
    console.log("Migration executed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);
