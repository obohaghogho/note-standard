require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Client } = require("pg");

async function checkCryptoTables() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({ connectionString: dbUrl.replace(":6543", ":5432"), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'crypto_%'
  `);
  console.log("Existing crypto tables:", res.rows.map(r => r.table_name));
  await client.end();
}

checkCryptoTables();
