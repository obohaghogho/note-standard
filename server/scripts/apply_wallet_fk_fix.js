/**
 * Apply Migration 047: Fix Wallet → Transactions Foreign Key
 * 
 * This script ensures the wallet_id FK on the transactions table
 * is properly configured so PostgREST recognizes the relationship
 * for queries like:  .select('*, wallet:wallets(currency)')
 * 
 * Run from server directory:  node scripts/apply_wallet_fk_fix.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function applyFix() {
    console.log('\n==========================================');
    console.log('📦 Migration 047: Fix Wallet → Transactions FK');
    console.log('==========================================\n');

    // Step 1: Verify tables exist
    console.log('1️⃣  Checking tables exist...');

    const { data: wallets, error: wErr } = await supabase
        .from('wallets')
        .select('id')
        .limit(1);
    
    if (wErr) {
        console.error('   ❌ Wallets table error:', wErr.message);
        process.exit(1);
    }
    console.log('   ✅ wallets table exists');

    const { data: txs, error: tErr } = await supabase
        .from('transactions')
        .select('id, wallet_id')
        .limit(1);

    if (tErr) {
        console.error('   ❌ Transactions table error:', tErr.message);
        process.exit(1);
    }
    console.log('   ✅ transactions table exists (wallet_id column present)');

    // Step 2: Test the FK relationship via PostgREST join
    console.log('\n2️⃣  Testing PostgREST join: transactions → wallets...');

    const { data: joinTest, error: joinErr } = await supabase
        .from('transactions')
        .select('id, wallet_id, wallet:wallets(id, currency)')
        .limit(1);

    if (joinErr) {
        console.error('   ❌ Join FAILED:', joinErr.message);
        console.log('\n   ⚠️  The FK relationship may not be recognized by PostgREST.');
        console.log('   👉 You need to run this SQL in the Supabase Dashboard SQL Editor:\n');
        console.log('   -------------------------------------------------------');
        console.log('   -- Ensure FK exists (the original schema already defines it,');
        console.log('   -- but PostgREST may need a schema cache reload)');
        console.log('   ');
        console.log('   -- Option A: Notify PostgREST to reload schema cache');
        console.log("   NOTIFY pgrst, 'reload schema';");
        console.log('   ');
        console.log('   -- Option B: If FK was dropped somehow, re-add it');
        console.log('   ALTER TABLE public.transactions');
        console.log('     DROP CONSTRAINT IF EXISTS transactions_wallet_id_fkey;');
        console.log('   ALTER TABLE public.transactions');
        console.log('     ADD CONSTRAINT transactions_wallet_id_fkey');
        console.log('     FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;');
        console.log('   ');
        console.log("   NOTIFY pgrst, 'reload schema';");
        console.log('   -------------------------------------------------------');
    } else {
        console.log('   ✅ Join works! PostgREST recognizes the FK relationship.');
        console.log('   Data:', JSON.stringify(joinTest, null, 2));
    }

    // Step 3: Test the full transaction fetch query (same as wallet.js route)
    console.log('\n3️⃣  Testing full transaction fetch query...');
    
    const { data: fullTest, error: fullErr } = await supabase
        .from('transactions')
        .select('*, wallet:wallets(currency)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (fullErr) {
        console.error('   ❌ Full query error:', fullErr.message);
    } else {
        console.log(`   ✅ Full query returned ${fullTest?.length || 0} transactions`);
        if (fullTest && fullTest.length > 0) {
            fullTest.forEach(tx => {
                console.log(`      - ${tx.type} | ${tx.amount} ${tx.currency} | Status: ${tx.status} | Wallet Currency: ${tx.wallet?.currency || 'N/A'}`);
            });
        }
    }

    // Step 4: Check presence-related fields
    console.log('\n4️⃣  Checking presence fields on profiles...');
    
    const { data: profileTest, error: profileErr } = await supabase
        .from('profiles')
        .select('id, is_online, last_active_at, last_seen')
        .limit(1);

    if (profileErr) {
        console.error('   ❌ Profile presence query error:', profileErr.message);
        console.log('   👉 Ensure migration 034_add_presence_fields.sql has been applied.');
    } else {
        console.log('   ✅ Presence fields exist on profiles table');
    }

    console.log('\n==========================================');
    console.log('✅ Diagnostic complete!');
    console.log('==========================================\n');
}

applyFix().catch(err => {
    console.error('\n💀 Fatal error:', err);
    process.exit(1);
});
