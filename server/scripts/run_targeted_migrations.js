const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function runTargetedMigrations() {
  const pgConnString = process.env.DATABASE_URL;
  if (!pgConnString) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const client = new Client({ connectionString: pgConnString });
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    const migrationsToApply = [
      "186_fix_auto_ledger_uuid_cast.sql",
      "187_drop_legacy_wallet_triggers.sql"
    ];

    const migrationsDir = path.join(__dirname, "../database/migrations");

    for (const file of migrationsToApply) {
      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`Success: ${file}`);
    }
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

runTargetedMigrations();
