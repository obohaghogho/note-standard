require('dotenv').config({path: './server/.env'});
const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT m.id, m.content, m.created_at, m.sender_id, m.type, m.conversation_id
    FROM messages m
    WHERE m.created_at >= NOW() - INTERVAL '4 hours'
    ORDER BY m.created_at DESC
    LIMIT 20
  `);
  console.log("ALL recent messages from last 4 hours:", res.rows);
  await client.end();
}
run().catch(console.error);
