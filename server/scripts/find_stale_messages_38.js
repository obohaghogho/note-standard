'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function inspectRange550to875() {
    const client = await pool.connect();
    try {
        const cid = '38f8ff88-bfa7-460a-9b94-89086bb534ca';

        const res = await client.query(`
            SELECT id, conversation_id, sender_id, content, created_at, sequence_number, is_deleted
            FROM messages
            WHERE conversation_id = $1
              AND sequence_number >= 550
            ORDER BY sequence_number ASC;
        `, [cid]);

        console.log(`=== MESSAGES IN CONVERSATION ${cid} FROM SEQ 550 UPWARDS (${res.rows.length}) ===`);
        console.table(res.rows.map(m => ({
            id: m.id,
            seq: m.sequence_number,
            sender: m.sender_id === '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd' ? 'Aghogho' : 'Admin',
            content: m.content,
            created_at: m.created_at
        })));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

inspectRange550to875().catch(console.error);
