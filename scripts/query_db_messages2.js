require('dotenv').config({path: './server/.env'});
const { Client } = require('pg');
const client = new Client(process.env.DATABASE_URL);
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT m.id, m.content, m.created_at, m.sender_id, m.type, m.conversation_id
    FROM messages m
    JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
    JOIN profiles p ON cm.user_id = p.id
    WHERE p.email IN ('obohoboh107@gmail.com', 'onomejohn107@gmail.com')
    ORDER BY m.created_at DESC
    LIMIT 10
  `);
  console.log("Recent messages:", res.rows);
  await client.end();
}
run().catch(console.error);
