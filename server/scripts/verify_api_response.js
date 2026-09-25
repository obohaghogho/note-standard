'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyApiResponse() {
    const client = await pool.connect();
    try {
        const cid = '38f8ff88-bfa7-460a-9b94-89086bb534ca';

        console.log('=== SIMULATING BACKEND MESSAGES API FOR CONVERSATION 38 ===\n');

        const res = await client.query(`
            SELECT id, conversation_id, sender_id, content, created_at, sequence_number, is_deleted
            FROM messages
            WHERE conversation_id = $1 AND is_deleted = false
            ORDER BY sequence_number DESC NULLS LAST, created_at DESC
            LIMIT 20;
        `, [cid]);

        console.log(`Latest 20 messages returned by DB endpoint:`);
        console.table(res.rows.map(m => ({
            id: m.id,
            seq: m.sequence_number,
            sender: m.sender_id === '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd' ? 'Aghogho' : 'Admin',
            content: m.content,
            created_at: m.created_at
        })));

        // Check if any deleted message ID is returned
        const deletedIds = [
            '29197dc3-cd06-4f61-88c1-6070c496edf8',
            '590e9e65-b377-4a7c-9cea-cb7a8ed713ae',
            '942d1ceb-ad97-4520-a14a-f2e8bf7bfe1e',
            '9926cd9c-c9d2-43bb-a5a4-071a9386c99c',
            'b63a5749-3112-4dae-baf4-c8edf4d4acf5'
        ];

        const hasDeleted = res.rows.some(r => deletedIds.includes(r.id));
        console.log(`\nContains any of the removed stale message IDs? ${hasDeleted ? 'YES ❌' : 'NO ✅'}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyApiResponse().catch(console.error);
