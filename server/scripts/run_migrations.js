const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// We use the postgres connection directly for migrations usually,
// but since we are in an agent environment and might not have direct psql access to a remote db,
// we can attempt to run RPCs or use a specialized migration table if implemented.
// HOWEVER, most of these migrations are raw SQL to be run in the Supabase SQL Editor.
// Since I can't easily run raw SQL via the client without a custom edge function or direct PG connection,
// I'll check if there's a PG connection string in .env.

async function runMigrations() {
  console.log("Migration runner starting...");

  const pgConnString = process.env.DATABASE_URL || process.env.DIRECT_URL;

  if (pgConnString) {
    const { Client } = require("pg");
    const client = new Client({ connectionString: pgConnString });

    try {
      await client.connect();
      console.log("Connected to PostgreSQL");

      // 1. Create migration tracking table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT UNIQUE NOT NULL,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const migrationsDir = path.join(__dirname, "../database/migrations");
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith(".sql"))
        .sort();

      // 2. Fetch already applied migrations
      const { rows } = await client.query("SELECT filename FROM _migrations");
      const appliedFiles = new Set(rows.map(r => r.filename));

      for (const file of files) {
        if (appliedFiles.has(file)) {
          console.log(`Skipping already applied migration: ${file}`);
          continue;
        }

        console.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
          await client.query("COMMIT");
          console.log(`✅ Success: ${file}`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`❌ Error in ${file}:`, err.message);
          // If a migration fails, we stop to prevent partial state
          process.exit(1);
        }
      }
      console.log("All migrations processed.");
    } catch (err) {
      console.error("Migration fatal error:", err);
    } finally {
      await client.end();
    }
  } else {
    console.log(
      "No direct DATABASE_URL found. Please apply migrations manually via Supabase SQL Editor.",
    );
  }
}

runMigrations();
