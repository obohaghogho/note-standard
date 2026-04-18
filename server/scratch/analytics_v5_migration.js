require('dotenv').config({path: __dirname + '/../.env'});
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log("Connected to database...");
    
    // Upgrade Profiles
    await client.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ad_wallet_balance NUMERIC(10,2) DEFAULT 0.00;
    `).catch(err => console.log('ad_wallet_balance might already exist or error:', err.message));

    // Upgrade Ads
    await client.query(`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS cpc_bid NUMERIC(10,2) DEFAULT 0.05;
    `).catch(err => console.log('cpc_bid might already exist or error:', err.message));
    
    // Create Top Up Ledger
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        amount NUMERIC(10,2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'completed',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(err => console.log('wallet_transactions might already exist or error:', err.message));

    console.log("Migration V5 completed successfully.");
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    client.end();
  }
}

migrate();
