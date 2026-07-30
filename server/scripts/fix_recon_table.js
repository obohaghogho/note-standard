require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Client } = require("pg");

async function fixReconTable() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({ connectionString: dbUrl.replace(":6543", ":5432"), ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    ALTER TABLE public.crypto_reconciliation_reports 
    ADD COLUMN IF NOT EXISTS user_liabilities_total JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS custody_assets_total JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS blockchain_confirmations_total JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pending_transactions_total JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'BALANCED';
  `);
  console.log("crypto_reconciliation_reports columns updated!");
  await client.end();
}

fixReconTable();
