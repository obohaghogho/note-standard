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

    const sql = `
      ALTER TABLE public.messages 
      ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;
      
      NOTIFY pgrst, 'reload schema';
    `;
    
    console.log("Running SQL to add reply_to_id column and reload schema...");
    await client.query(sql);
    console.log("SQL executed successfully!");

  } catch (err) {
    console.error("Error executing SQL:", err.message);
  } finally {
    await client.end();
  }
}

run();
