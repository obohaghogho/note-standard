const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  console.log("Database URL configured:", dbUrl ? "YES (" + dbUrl.substring(0, 25) + "...)" : "NO");

  if (!dbUrl) {
    console.error("❌ No DATABASE_URL found in env file.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL database successfully!");

    const sqlPath = path.join(__dirname, '../database/migrations/900_disk_io_budget_preservation.sql');
    console.log(`Reading SQL file: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing Migration 900 Disk I/O Budget Preservation...");
    await client.query(sql);
    console.log("🎉 SUCCESS: Migration 900 applied! All Disk I/O indexes, RLS optimizations, and auto-pruning RPCs created.");

    // Run VACUUM ANALYZE to reclaim space and update query planner statistics immediately
    console.log("Running VACUUM ANALYZE to reclaim disk pages and update Postgres query planner stats...");
    try {
      await client.query("VACUUM (ANALYZE, VERBOSE);");
    } catch (vErr) {
      console.log("Note on VACUUM:", vErr.message);
    }

    // Call auto-pruning RPC
    console.log("Calling rpc_prune_telemetry_and_logs() to purge bloat tables...");
    const res = await client.query("SELECT public.rpc_prune_telemetry_and_logs();");
    console.log("Prune result:", res.rows[0]);

  } catch (err) {
    console.error("❌ Migration error details:", err);
  } finally {
    await client.end();
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
