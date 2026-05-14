require('dotenv').config({ path: './server/.env' });
const supabase = require('./server/config/database');
const { createClient } = require('@supabase/supabase-js');

// Create a direct Postgres connection if possible, or use Supabase RPC if we can't
const { Client } = require('pg');

async function getPolicies() {
    const connectionString = process.env.DATABASE_URL; // If available, otherwise we use Supabase REST
    
    if (connectionString) {
        const client = new Client({ connectionString });
        await client.connect();
        const res = await client.query(`
            SELECT tablename, policyname 
            FROM pg_policies 
            WHERE tablename IN ('conversation_members', 'team_members')
        `);
        console.log("POLICIES IN DATABASE:");
        console.table(res.rows);
        await client.end();
    } else {
        console.log("No DATABASE_URL found. Querying via Supabase REST is not possible for pg_policies.");
        console.log("Attempting to guess the policy by calling a custom RPC or we need DATABASE_URL.");
    }
}

getPolicies();
