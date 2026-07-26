require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, "database/migrations/232_create_support_infrastructure.sql"), "utf8");
    console.log("Running migration...");
    await client.query(sql);
    console.log("Migration successful");
  } catch(e) {
    console.error("Migration failed:", e.message);
  } finally {
    await client.end();
  }
}
run();
