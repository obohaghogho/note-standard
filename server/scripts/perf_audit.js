const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function audit() {
    console.log('--- RLS and Performance Audit ---');

    // 1. Check for Tables
    console.log('\n[1] Checking Tables...');
    const tables = ['profiles', 'notes', 'shared_notes', 'ads', 'subscriptions', 'daily_stats', 'notifications', 'wallets', 'dashboard_stats'];
    for (const table of tables) {
        const { error } = await supabase.from(table).select('id').limit(1);
        if (error) {
            console.log(`- ${table}: ${error.code === 'P0001' ? 'Exists (but Error)' : 'Possibly Missing or Error: ' + error.message}`);
        } else {
            console.log(`- ${table}: Exists`);
        }
    }

    // 2. Fetch Policies (using RPC if available or just reporting)
    console.log('\n[2] Note: I will manually read migration files for policies as RPC for pg_policies might not be setup.');
    
    // 3. Check for specific recursion indicator (Timeout)
    console.log('\n[3] Testing Query Performance...');
    const testTables = ['profiles', 'notes', 'ads'];
    for (const table of testTables) {
        const start = Date.now();
        const { data, error } = await supabase.from(table).select('id').limit(1);
        const end = Date.now();
        if (error) {
            console.log(`- ${table} query: ERROR after ${end - start}ms (${error.message})`);
        } else {
            console.log(`- ${table} query: SUCCESS in ${end - start}ms`);
        }
    }
}

audit();
