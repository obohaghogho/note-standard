'use strict';
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyDatabaseAndMigration() {
    console.log('=== STEP 2 — DATABASE MIGRATION & TRIGGER VERIFICATION ===\n');
    const client = await pool.connect();
    try {
        // 1. Check if trigger function messages_auto_assign_sequence exists
        const fnRes = await client.query(`
            SELECT proname FROM pg_proc WHERE proname = 'messages_auto_assign_sequence';
        `);
        console.log(`Function 'messages_auto_assign_sequence': ${fnRes.rows.length > 0 ? 'EXISTS ✅' : 'NOT FOUND ⚠️'}`);

        // 2. Check if trigger trg_messages_auto_sequence exists on messages table
        const trgRes = await client.query(`
            SELECT trigger_name FROM information_schema.triggers
            WHERE event_object_table = 'messages' AND trigger_name = 'trg_messages_auto_sequence';
        `);
        console.log(`Trigger 'trg_messages_auto_sequence': ${trgRes.rows.length > 0 ? 'EXISTS ✅' : 'NOT FOUND ⚠️'}`);

        // 3. If missing, apply migration 492
        if (fnRes.rows.length === 0 || trgRes.rows.length === 0) {
            console.log('\n--> Applying Migration 492 to database...');
            const migSql = fs.readFileSync(path.join(__dirname, '../database/migrations/492_messages_auto_sequence_trigger.sql'), 'utf8');
            await client.query(migSql);
            console.log('--> Migration 492 successfully applied! ✅');
        }

        // 4. Re-verify trigger presence
        const checkTrg = await client.query(`
            SELECT trigger_name FROM information_schema.triggers
            WHERE event_object_table = 'messages' AND trigger_name = 'trg_messages_auto_sequence';
        `);
        console.log(`\nRe-check Trigger 'trg_messages_auto_sequence': ${checkTrg.rows.length > 0 ? 'ACTIVE ✅' : 'FAILED ❌'}`);

        // 5. Inspect messages columns & constraints
        const cols = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'messages' AND column_name IN ('id', 'sequence_number', 'event_id', 'client_request_id', 'created_at');
        `);
        console.log('\n=== MESSAGES SCHEMA VERIFICATION ===');
        cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

    } catch (err) {
        console.error('Database probe error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyDatabaseAndMigration().catch(console.error);
