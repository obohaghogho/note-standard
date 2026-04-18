require('dotenv').config({path: __dirname + '/../.env'});
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log("Connected to database...");
    
    // Add columns to ads table if not exists safely using DO block or just error catching
    await client.query(`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS max_views INTEGER DEFAULT NULL;
    `).catch(err => console.log('max_views exists'));
    
    await client.query(`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS max_clicks INTEGER DEFAULT NULL;
    `).catch(err => console.log('max_clicks exists'));

    await client.query(`
      ALTER TABLE ad_analytics_events ADD COLUMN IF NOT EXISTS user_agent VARCHAR(1024);
    `).catch(err => console.log('user_agent exists'));

    await client.query(`
      ALTER TABLE ad_analytics_events ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
    `).catch(err => console.log('device_id exists'));

    console.log("Creating fraud indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_analytics_deviceId 
      ON ad_analytics_events(device_id, event_type, created_at);
    `);

    console.log("Migration V2 completed successfully.");
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    client.end();
  }
}

migrate();
