require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Client } = require("pg");

async function checkReconColumns() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({ connectionString: dbUrl.replace(":6543", ":5432"), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'crypto_reconciliation_reports'
  `);
  console.log("Columns in crypto_reconciliation_reports:", res.rows);
  await client.end();
}

checkReconColumns();
