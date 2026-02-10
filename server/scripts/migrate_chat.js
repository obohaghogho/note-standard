const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const migrationFile = path.join(__dirname, '../database/migrations/006_chat_schema.sql');

async function runMigration() {
    console.log('Connecting to database...');
    // Prefer DATABASE_URL from env
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected.');

        console.log(`Reading migration file: ${migrationFile}`);
        const sql = fs.readFileSync(migrationFile, 'utf8');

        console.log('Executing migration...');
        await client.query(sql);
        console.log('Migration executed successfully! Tables Created.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
