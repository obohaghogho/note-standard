const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
    const migrationPath = path.join(__dirname, '../database/migrations/187_fix_confirm_deposit_v6_types.sql');
    
    if (!fs.existsSync(migrationPath)) {
        console.error("Migration file not found at:", migrationPath);
        process.exit(1);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log("Running Migration 187...");
    
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log("Connected to PostgreSQL via DATABASE_URL");
        await client.query(sql);
        console.log("Migration 187 executed successfully.");
    } catch (err) {
        console.error("Migration Failed:", err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
