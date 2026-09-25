const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPhase1And2() {
  console.log('================================================================================');
  console.log(' 🔍 PHASE 1 & 2 — DATABASE CATALOG QUERY & PRECONDITION CHECKS');
  console.log('================================================================================\n');

  // Check 1: Duplicate source_transaction_id in revenue_logs
  const { data: revLogs } = await supabase.from('revenue_logs').select('id, source_transaction_id, currency, amount');
  const seenTx = new Map();
  const duplicates = [];
  let nullSourceCount = 0;

  for (const r of revLogs || []) {
    if (!r.source_transaction_id) {
      nullSourceCount++;
      continue;
    }
    if (seenTx.has(r.source_transaction_id)) {
      duplicates.push({ txId: r.source_transaction_id, first: seenTx.get(r.source_transaction_id), duplicate: r });
    } else {
      seenTx.set(r.source_transaction_id, r);
    }
  }

  console.log(`Precondition 1: Duplicate source_transaction_id count: ${duplicates.length}`);
  if (duplicates.length > 0) console.log('Duplicate Details:', duplicates);

  console.log(`Precondition 2: NULL source_transaction_id count: ${nullSourceCount}`);

  // Check 3: Orphaned source_transaction_id
  const orphanLogs = [];
  for (const r of revLogs || []) {
    if (!r.source_transaction_id) continue;
    const { data: tx } = await supabase.from('transactions').select('id, status, currency').eq('id', r.source_transaction_id).maybeSingle();
    if (!tx) {
      orphanLogs.push(r);
    }
  }

  console.log(`Precondition 3: Orphaned source_transaction_id count: ${orphanLogs.length}`);
  if (orphanLogs.length > 0) console.log('Orphan Details:', orphanLogs);

  // Check 4: Currency mismatches between revenue_logs and transactions
  const currencyMismatches = [];
  for (const r of revLogs || []) {
    if (!r.source_transaction_id) continue;
    const { data: tx } = await supabase.from('transactions').select('id, currency').eq('id', r.source_transaction_id).maybeSingle();
    if (tx && (tx.currency || '').toUpperCase() !== (r.currency || '').toUpperCase()) {
      currencyMismatches.push({ log: r, tx });
    }
  }

  console.log(`Precondition 4: Currency mismatch count: ${currencyMismatches.length}`);

  console.log('\n--- PRECONDITION SUMMARY ---');
  console.log(`- Duplicates  : ${duplicates.length === 0 ? '✅ NONE' : '❌ FOUND'}`);
  console.log(`- NULL Sources: ${nullSourceCount === 0 ? '✅ NONE' : '❌ FOUND'}`);
  console.log(`- Orphans     : ${orphanLogs.length === 0 ? '✅ NONE' : '❌ FOUND'}`);
  console.log(`- Mismatches  : ${currencyMismatches.length === 0 ? '✅ NONE' : '❌ FOUND'}`);
}

verifyPhase1And2().catch(console.error);
