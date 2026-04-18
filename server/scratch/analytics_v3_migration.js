require('dotenv').config({path: __dirname + '/../.env'});
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log("Connected to database...");
    
    // Add advertiser_value column
    await client.query(`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS advertiser_value NUMERIC(10,2) DEFAULT 5.00;
    `).catch(err => console.log('advertiser_value might already exist or error:', err.message));
    
    // Create system_alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_alerts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        alert_type VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(err => console.log('system_alerts might already exist or error:', err.message));

    console.log("Migration V3 completed successfully.");
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    client.end();
  }
}

migrate();
