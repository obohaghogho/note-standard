const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

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

  // Check for PG connection string
  const pgConnString = process.env.DATABASE_URL || process.env.DIRECT_URL;

  if (pgConnString) {
    const { Client } = require("pg");
    const client = new Client({ connectionString: pgConnString });

    try {
      await client.connect();
      console.log("Connected to PostgreSQL");

      const migrationsDir = path.join(__dirname, "../database/migrations");
      const files = fs.readdirSync(migrationsDir).sort();

      for (const file of files) {
        if (file.endsWith(".sql")) {
          console.log(`Applying migration: ${file}`);
          const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
          await client.query(sql);
          console.log(`Success: ${file}`);
        }
      }
    } catch (err) {
      console.error("Migration error:", err);
    } finally {
      await client.end();
    }
  } else {
    console.log(
      "No direct DATABASE_URL found. Please apply migrations manually via Supabase SQL Editor if this is a remote DB.",
    );
    console.log("Found migrations to apply:");
    const migrationsDir = path.join(__dirname, "../database/migrations");
    fs.readdirSync(migrationsDir).sort().forEach((f) => console.log(`- ${f}`));
  }
}

runMigrations();
