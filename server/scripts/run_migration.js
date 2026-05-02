const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration(migrationPath) {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log(`Connected to database. Running migration: ${migrationPath}`);
        
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        // We split by ';' but carefully to handle BEGIN/COMMIT and DO blocks.
        // Actually, let's just run the whole thing as one query if it's small.
        // Or use a transaction.
        
        await client.query(sql);
        console.log('Migration applied successfully.');
        
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

const migrationFile = process.argv[2];
if (!migrationFile) {
    console.error('Please specify a migration file path.');
    process.exit(1);
}

runMigration(path.resolve(migrationFile));
