'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyDeletedMessages() {
    const client = await pool.connect();
    try {
        const cid = '38f8ff88-bfa7-460a-9b94-89086bb534ca';
        const targetMessageIds = [
            '29197dc3-cd06-4f61-88c1-6070c496edf8',
            '590e9e65-b377-4a7c-9cea-cb7a8ed713ae',
            '942d1ceb-ad97-4520-a14a-f2e8bf7bfe1e',
            '9926cd9c-c9d2-43bb-a5a4-071a9386c99c',
            'b63a5749-3112-4dae-baf4-c8edf4d4acf5'
        ];

        console.log('=== VERIFY DELETED MESSAGES IN DATABASE ===');
        const check = await client.query(`
            SELECT id, conversation_id, content, created_at, sequence_number
            FROM messages
            WHERE id = ANY($1::uuid[]) OR conversation_id = $2 AND content ILIKE '%Hope no failed message%';
        `, [targetMessageIds, cid]);

        console.log(`Remaining matching rows: ${check.rows.length}`);
        console.table(check.rows);

        console.log('\n=== VERIFY CONVERSATION POINTER ===');
        const conv = await client.query(`
            SELECT id, last_message_id, last_message_at, seq_counter, updated_at
            FROM conversations
            WHERE id = $1;
        `, [cid]);
        console.table(conv.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyDeletedMessages().catch(console.error);
