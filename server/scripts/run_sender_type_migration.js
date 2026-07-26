const { Client } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pgConnString = process.env.DATABASE_URL || process.env.DIRECT_URL;

async function addSenderTypeColumn() {
  console.log("Connecting directly to PostgreSQL...");
  const client = new Client({ connectionString: pgConnString });
  
  await client.connect();
  console.log("Connected to PostgreSQL DB successfully!");

  console.log("Adding sender_type column to messages table if not exists...");
  await client.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type text DEFAULT 'user';
  `);

  console.log("✅ Column sender_type added to messages table!");
  await client.end();
}

addSenderTypeColumn().then(() => process.exit(0)).catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
