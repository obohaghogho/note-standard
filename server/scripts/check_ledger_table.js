require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Client } = require("pg");

async function checkLedgerEntries() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({ connectionString: dbUrl.replace(":6543", ":5432"), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ledger_entries'
  `);
  console.log("Existing columns in ledger_entries:", res.rows);
  await client.end();
}

checkLedgerEntries();
