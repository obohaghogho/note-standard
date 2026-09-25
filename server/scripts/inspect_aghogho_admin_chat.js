'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function inspectSchema() {
    const client = await pool.connect();
    try {
        console.log('=== CONVERSATIONS TABLE COLUMNS ===');
        const cCols = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'conversations';
        `);
        console.table(cCols.rows);

        console.log('\n=== MESSAGES TABLE COLUMNS ===');
        const mCols = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages';
        `);
        console.table(mCols.rows);

        console.log('\n=== CONVERSATION PARTICIPANTS OR RELATED TABLES ===');
        const tables = await client.query(`
            SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%conversation%';
        `);
        console.table(tables.rows);

        // Search messages for the exact text strings:
        // "Hello", "Who are you?", "Give me my money?", "Hope no failed message", "Me"
        console.log('\n=== SEARCHING FOR SPECIFIC STALE MESSAGES IN MESSAGES TABLE ===');
        const targetMsgs = await client.query(`
            SELECT * FROM messages
            WHERE content ILIKE '%Hello%'
               OR content ILIKE '%Who are you%'
               OR content ILIKE '%Give me my money%'
               OR content ILIKE '%Hope no failed message%'
               OR content = 'Me';
        `);
        console.table(targetMsgs.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

inspectSchema().catch(console.error);
