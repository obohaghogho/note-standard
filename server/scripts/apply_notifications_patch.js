const { Client } = require("pg");
require("dotenv").config();

async function runPatch() {
  const client = new Client({
    connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL for patching notifications table.");

    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body text;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'failed'));
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel text CHECK (channel IN ('in-app', 'push', 'email')) DEFAULT 'in-app';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at timestamptz;
    `);

    console.log("Successfully altered notifications table.");
  } catch (err) {
    console.error("Patching failed:", err.message);
  } finally {
    await client.end();
  }
}

runPatch().catch(console.error);
