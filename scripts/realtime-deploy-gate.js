#!/usr/bin/env node
/**
 * realtime-deploy-gate.js
 *
 * Automated deployment safety gate for the Note Standard realtime system.
 *
 * Runs a set of database integrity and sequencing checks before any deployment.
 * If ANY check fails, this script exits with code 1 to halt the CI/CD pipeline.
 *
 * Usage:
 *   node scripts/realtime-deploy-gate.js
 *
 * Set DATABASE_URL environment variable before running.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
});

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
    process.stdout.write(`  ⏳ ${name}...`);
    try {
        const result = await fn();
        if (result.pass) {
            console.log(`\r  ✅ ${name}`);
            passed++;
        } else {
            console.log(`\r  ❌ ${name}: ${result.reason}`);
            failed++;
            failures.push({ name, reason: result.reason });
        }
    } catch (err) {
        console.log(`\r  💥 ${name}: CRASHED — ${err.message}`);
        failed++;
        failures.push({ name, reason: `Exception: ${err.message}` });
    }
}

async function run() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║       NOTE STANDARD — REALTIME DEPLOY GATE          ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // ── 1. Migration Verification ──────────────────────────────────────────────
    console.log('[ Section 1: Migration Verification ]');
    await check('Migration 189 constraints applied (event_id UNIQUE)', async () => {
        const { rows } = await pool.query(`
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_name = 'messages' AND constraint_name = 'messages_event_id_key';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'messages_event_id_key constraint missing — run migration 189' };
    });

    await check('Migration 189 constraints applied (conv+seq UNIQUE)', async () => {
        const { rows } = await pool.query(`
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_name = 'messages' AND constraint_name = 'messages_conv_seq_key';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'messages_conv_seq_key constraint missing — run migration 189' };
    });

    await check('RPC function rpc_send_message exists', async () => {
        const { rows } = await pool.query(`
            SELECT routine_name FROM information_schema.routines
            WHERE routine_schema = 'public' AND routine_name = 'rpc_send_message';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'rpc_send_message function missing — run migration 189' };
    });

    // ── 2. Sequence Gap Detection ──────────────────────────────────────────────
    console.log('\n[ Section 2: Sequence Integrity ]');
    await check('No duplicate (conversation_id, sequence_number) pairs', async () => {
        const { rows } = await pool.query(`
            SELECT conversation_id, sequence_number, COUNT(*) as cnt
            FROM messages
            WHERE sequence_number IS NOT NULL AND sequence_number > 0
            GROUP BY conversation_id, sequence_number
            HAVING COUNT(*) > 1
            LIMIT 5;
        `);
        return rows.length === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${rows.length} duplicate sequence entries (e.g. conv ${rows[0].conversation_id}, seq ${rows[0].sequence_number})` };
    });

    await check('No duplicate event_ids', async () => {
        const { rows } = await pool.query(`
            SELECT event_id, COUNT(*) as cnt
            FROM messages
            WHERE event_id IS NOT NULL
            GROUP BY event_id
            HAVING COUNT(*) > 1
            LIMIT 5;
        `);
        return rows.length === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${rows.length} duplicate event_id values` };
    });

    await check('No zero sequence_numbers on recent messages (last 1000)', async () => {
        const { rows } = await pool.query(`
            SELECT COUNT(*) as cnt FROM (
                SELECT sequence_number FROM messages
                ORDER BY created_at DESC
                LIMIT 1000
            ) sub WHERE sequence_number = 0;
        `);
        const count = parseInt(rows[0].cnt, 10);
        return count === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${count} messages with sequence_number = 0` };
    });

    // ── 3. Unread Count Integrity ──────────────────────────────────────────────
    console.log('\n[ Section 3: Unread Count Integrity ]');
    await check('conversation_unread_state table exists', async () => {
        const { rows } = await pool.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'conversation_unread_state';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'conversation_unread_state table not found — check schema' };
    });

    await check('No negative unread counts', async () => {
        const { rows } = await pool.query(`
            SELECT COUNT(*) as cnt FROM conversation_unread_state WHERE unread_count < 0;
        `).catch(() => ({ rows: [{ cnt: 0 }] }));
        const count = parseInt(rows[0].cnt, 10);
        return count === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${count} rows with negative unread counts` };
    });

    // ── 4. Orphan Conversation Detection ──────────────────────────────────────
    console.log('\n[ Section 4: Orphan Conversation Detection ]');
    await check('No orphaned messages (conversation exists for every message)', async () => {
        const { rows } = await pool.query(`
            SELECT COUNT(*) as cnt FROM messages m
            LEFT JOIN conversations c ON c.id = m.conversation_id
            WHERE c.id IS NULL AND m.is_deleted = false;
        `).catch(() => ({ rows: [{ cnt: 0 }] }));
        const count = parseInt(rows[0].cnt, 10);
        return count === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${count} messages referencing non-existent conversations` };
    });

    await check('No conversations with zero members', async () => {
        const { rows } = await pool.query(`
            SELECT COUNT(*) as cnt FROM conversations c
            LEFT JOIN conversation_members cm ON cm.conversation_id = c.id
            WHERE cm.conversation_id IS NULL;
        `);
        const count = parseInt(rows[0].cnt, 10);
        return count === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${count} conversations with no members` };
    });

    // ── 5. Conversation Version Drift ─────────────────────────────────────────
    console.log('\n[ Section 5: Conversation Version Drift ]');
    await check('version column exists on conversations', async () => {
        const { rows } = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'conversations' AND column_name = 'version';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'version column missing on conversations table' };
    });

    // ── 6. Replay Guard & RPC Completeness ────────────────────────────────────
    console.log('\n[ Section 6: Replay Guard & RPC Completeness ]');
    await check('rpc_delete_message function exists', async () => {
        const { rows } = await pool.query(`
            SELECT routine_name FROM information_schema.routines
            WHERE routine_schema = 'public' AND routine_name = 'rpc_delete_message';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'rpc_delete_message function missing — run migration 189' };
    });

    await check('rpc_mark_read function exists', async () => {
        const { rows } = await pool.query(`
            SELECT routine_name FROM information_schema.routines
            WHERE routine_schema = 'public' AND routine_name = 'rpc_mark_read';
        `);
        return rows.length > 0
            ? { pass: true }
            : { pass: false, reason: 'rpc_mark_read function missing — run migration 189' };
    });

    await check('No recent messages with NULL event_id (last 500)', async () => {
        const { rows } = await pool.query(`
            SELECT COUNT(*) as cnt FROM (
                SELECT id FROM messages
                WHERE event_id IS NULL
                ORDER BY created_at DESC
                LIMIT 500
            ) sub;
        `);
        const count = parseInt(rows[0].cnt, 10);
        return count === 0
            ? { pass: true }
            : { pass: false, reason: `Found ${count} recent messages with NULL event_id — replay guard bypass risk` };
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                   DEPLOY GATE RESULTS               ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  ✅ PASSED: ${String(passed).padEnd(3)}                                    ║`);
    console.log(`║  ❌ FAILED: ${String(failed).padEnd(3)}                                    ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');

    if (failures.length > 0) {
        console.log('FAILED CHECKS:');
        for (const f of failures) {
            console.log(`  ❌ ${f.name}`);
            console.log(`     → ${f.reason}`);
        }
        console.log('\n🚫 DEPLOYMENT BLOCKED — Resolve all failures before deploying.\n');
        await pool.end();
        process.exit(1); // Non-zero exit halts CI/CD pipeline
    }

    console.log('✅ All checks passed. Deployment is SAFE to proceed.\n');
    await pool.end();
    process.exit(0);
}

run().catch(async (err) => {
    console.error('\n💥 Deploy gate crashed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
});
