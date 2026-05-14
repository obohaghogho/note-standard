require('dotenv').config({ path: './server/.env' });
const { Client } = require('pg');

async function getMessagePolicies() {
    const connectionString = process.env.DATABASE_URL;
    const client = new Client({ connectionString });
    await client.connect();
    const res = await client.query(`
        SELECT tablename, policyname, qual 
        FROM pg_policies 
        WHERE tablename IN ('messages', 'team_messages', 'teams')
    `);
    console.log("MESSAGE POLICIES IN DATABASE:");
    console.table(res.rows);
    await client.end();
}

getMessagePolicies();
