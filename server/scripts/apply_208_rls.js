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

    const sqlPath = path.join(__dirname, '../database/migrations/208_fix_conversations_and_wallets_rls.sql');
    console.log(`Reading SQL file: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing Migration 208 (Fix Conversations and Wallets RLS Policies)...");
    await client.query(sql);
    console.log("🎉 SUCCESS: Migration 208 applied! RLS INSERT policies added for conversations, conversation_members, and wallets_store.");

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
