const { Client } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function run() {
  const pgConnString = process.env.DATABASE_URL;
  if (!pgConnString) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const client = new Client({ connectionString: pgConnString });
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    // Get wallets_v6 schema/view definition or columns
    const { rows: columns } = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'wallets_v6';
    `);
    console.log("wallets_v6 columns:", columns);

    // Get a few sample rows
    const { rows: sample } = await client.query(`
      SELECT * FROM public.wallets_v6 LIMIT 5;
    `);
    console.log("wallets_v6 samples:", sample);

    // Let's also check wallets_store table
    const { rows: storeColumns } = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'wallets_store';
    `);
    console.log("wallets_store columns:", storeColumns);

  } catch (err) {
    console.error("Error executing SQL:", err.message);
  } finally {
    await client.end();
  }
}

run();
