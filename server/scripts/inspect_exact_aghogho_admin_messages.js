'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function inspectConversation38() {
    const client = await pool.connect();
    try {
        const cid = '38f8ff88-bfa7-460a-9b94-89086bb534ca';
        console.log(`=== CONVERSATION ${cid} ===`);
        const conv = await client.query(`SELECT * FROM conversations WHERE id = $1;`, [cid]);
        console.table(conv.rows);

        const members = await client.query(`
            SELECT cm.user_id, p.full_name, p.email, p.role
            FROM conversation_members cm
            LEFT JOIN profiles p ON p.id = cm.user_id
            WHERE cm.conversation_id = $1;
        `, [cid]);
        console.log('Members:');
        console.table(members.rows);

        const msgs = await client.query(`
            SELECT id, conversation_id, sender_id, content, created_at, sequence_number, is_deleted, event_id
            FROM messages
            WHERE conversation_id = $1
            ORDER BY sequence_number ASC NULLS LAST, created_at ASC;
        `, [cid]);
        console.log(`Message Count: ${msgs.rows.length}`);
        console.table(msgs.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

inspectConversation38().catch(console.error);
