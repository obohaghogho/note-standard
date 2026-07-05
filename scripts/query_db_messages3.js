require('dotenv').config({path: './server/.env'});
const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT id, content, created_at, sender_id, type 
    FROM messages 
    WHERE conversation_id = '38f8ff88-bfa7-460a-9b94-89086bb534ca'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log("Recent messages in 38f8ff88-bfa7-460a-9b94-89086bb534ca:", res.rows);
  await client.end();
}
run().catch(console.error);
