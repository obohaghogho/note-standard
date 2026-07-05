require('dotenv').config({path: './server/.env'});
const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
async function run() {
  await client.connect();
  const res = await client.query("SELECT id, content, created_at, sender_id, type FROM messages WHERE content ILIKE '%God is the greatest%' ORDER BY created_at DESC LIMIT 5");
  console.log("God messages:", res.rows);
  const convRes = await client.query("SELECT id, content, created_at, sender_id, type FROM messages WHERE content ILIKE '%Chairlady%' ORDER BY created_at DESC LIMIT 5");
  console.log("Chairlady messages:", convRes.rows);
  await client.end();
}
run().catch(console.error);
