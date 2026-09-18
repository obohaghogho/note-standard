const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function verify() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Checking RLS policies on tables...");

    const res = await client.query(`
      SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename IN ('conversations', 'conversation_members', 'wallets_store', 'wallets')
      ORDER BY tablename, cmd;
    `);

    console.log(`Found ${res.rows.length} policies across target tables:`);
    console.table(res.rows.map(r => ({
      table: r.tablename,
      policy: r.policyname,
      cmd: r.cmd,
      roles: r.roles
    })));

  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    await client.end();
  }
}

verify().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
