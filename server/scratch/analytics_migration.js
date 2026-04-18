require('dotenv').config({path: __dirname + '/../.env'});
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    
    console.log("Creating ad_analytics_events table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_analytics_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ad_id UUID REFERENCES ads(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        viewer_ip VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log("Creating index for fraud protection...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_analytics_fraud 
      ON ad_analytics_events(ad_id, event_type, viewer_ip, created_at);
    `);

    console.log("Creating increment_ad_stat stored procedure...");
    await client.query(`
      CREATE OR REPLACE FUNCTION increment_ad_stat(row_id UUID, stat_type TEXT)
      RETURNS void AS $$
      BEGIN
        IF stat_type = 'view' THEN
          UPDATE ads SET views = views + 1 WHERE id = row_id;
        ELSIF stat_type = 'click' THEN
          UPDATE ads SET clicks = clicks + 1 WHERE id = row_id;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log("Migration completed successfully.");
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    client.end();
  }
}

migrate();
