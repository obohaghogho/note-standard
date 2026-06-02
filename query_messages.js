const { Pool } = require('pg');
require('dotenv').config({path: 'server/.env'});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {rejectUnauthorized: false}
});
pool.query("SELECT id, content, created_at, sender_id, event_id FROM messages ORDER BY created_at DESC LIMIT 5")
  .then(res => {
    console.table(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });
