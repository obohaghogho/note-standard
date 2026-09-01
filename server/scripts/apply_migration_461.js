const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function applyMigration461() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Applying Migration 461: provider_deposit_addresses_abstraction.sql...');

    const migrationPath = path.join(__dirname, '../database/migrations/461_provider_deposit_addresses_abstraction.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query(sql);
    console.log('✅ Migration 461 applied successfully.');

    // Verify table creation
    const verifyRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'provider_deposit_addresses';
    `);

    console.log('Verification result:', verifyRes.rows);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration461();
