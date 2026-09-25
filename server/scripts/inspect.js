const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function inspectDb() {
  console.log('=== FORENSIC DATABASE INSPECTION ===\n');

  // 1. Check table existences and row counts
  const tables = [
    'transactions', 'ledger_accounts', 'journal_entries', 'journal_lines',
    'platform_wallets', 'revenue_logs', 'commissions', 'fees',
    'wallets', 'wallets_store', 'settlements', 'treasury_accounts', 'payments'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`Table '${table}': ERROR (${error.message})`);
      } else {
        console.log(`Table '${table}': EXISTS (${count} rows)`);
      }
    } catch (e) {
      console.log(`Table '${table}': EXCEPTION (${e.message})`);
    }
  }

  // 2. Inspect transactions table
  console.log('\n--- ALL COMPLETED / INITIATED TRANSACTIONS ---');
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('id, type, amount, currency, fee, status, reference_id, metadata, created_at, user_id, provider, provider_reference, transaction_fee_breakdown')
    .order('created_at', { ascending: false });

  if (txErr) {
    console.error('Transactions query error:', txErr);
  } else {
    console.log(`Total transactions in DB: ${txs.length}`);
    const statusCounts = {};
    const typeCounts = {};
    const feeCounts = { zero: 0, positive: 0, null: 0 };
    
    txs.forEach(t => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
      const f = parseFloat(t.fee);
      if (isNaN(f) || t.fee === null) feeCounts.null++;
      else if (f > 0) feeCounts.positive++;
      else feeCounts.zero++;
    });

    console.log('Transaction Statuses:', statusCounts);
    console.log('Transaction Types:', typeCounts);
    console.log('Fee Distribution:', feeCounts);
    
    console.log('\nTop 20 Recent Transactions:');
    txs.slice(0, 20).forEach((t, i) => {
      console.log(`${i+1}. [${t.created_at}] ID:${t.id} Ref:${t.reference_id || t.provider_reference} Type:${t.type} Status:${t.status} Amt:${t.amount} ${t.currency} Fee:${t.fee} Provider:${t.provider}`);
    });

    console.log('\nNGN Transactions specifically:');
    const ngnTxs = txs.filter(t => (t.currency || '').toUpperCase() === 'NGN');
    console.log(`Total NGN Transactions: ${ngnTxs.length}`);
    ngnTxs.forEach((t, i) => {
      console.log(`${i+1}. [${t.created_at}] Ref:${t.reference_id || t.provider_reference} Type:${t.type} Status:${t.status} Amt:${t.amount} NGN Fee:${t.fee} Meta:${JSON.stringify(t.metadata)} Breakdown:${JSON.stringify(t.transaction_fee_breakdown)}`);
    });
  }

  // 3. Inspect ledger_accounts
  console.log('\n--- LEDGER ACCOUNTS ---');
  const { data: lAccs, error: lErr } = await supabase.from('ledger_accounts').select('*');
  if (lErr) console.log('ledger_accounts err:', lErr.message);
  else console.log('ledger_accounts count:', lAccs?.length, 'data:', JSON.stringify(lAccs, null, 2));

  // 4. Inspect platform_wallets
  console.log('\n--- PLATFORM WALLETS ---');
  const { data: pWallets, error: pwErr } = await supabase.from('platform_wallets').select('*');
  if (pwErr) console.log('platform_wallets err:', pwErr.message);
  else console.log('platform_wallets data:', JSON.stringify(pWallets, null, 2));

  // 5. Inspect revenue_logs
  console.log('\n--- REVENUE LOGS ---');
  const { data: rLogs, error: rlErr } = await supabase.from('revenue_logs').select('*');
  if (rlErr) console.log('revenue_logs err:', rlErr.message);
  else console.log('revenue_logs count:', rLogs?.length, 'data:', JSON.stringify(rLogs, null, 2));

  // 6. Inspect commissions
  console.log('\n--- COMMISSIONS ---');
  const { data: comms, error: cErr } = await supabase.from('commissions').select('*');
  if (cErr) console.log('commissions err:', cErr.message);
  else console.log('commissions count:', comms?.length, 'data:', JSON.stringify(comms, null, 2));

  // 7. Inspect journal_entries & lines
  console.log('\n--- JOURNAL ENTRIES ---');
  const { data: jEntries, error: jErr } = await supabase.from('journal_entries').select('*').limit(20);
  if (jErr) console.log('journal_entries err:', jErr.message);
  else console.log(`journal_entries count (top 20 of ${jEntries?.length}):`, JSON.stringify(jEntries, null, 2));

  // 8. Inspect fees table if exists
  console.log('\n--- FEES TABLE ---');
  const { data: feesData, error: feesErr } = await supabase.from('fees').select('*').limit(20);
  if (feesErr) console.log('fees table err:', feesErr.message);
  else console.log('fees table data:', JSON.stringify(feesData, null, 2));

  // 9. Inspect treasury_accounts if exists
  console.log('\n--- TREASURY ACCOUNTS ---');
  const { data: tAccs, error: tErr } = await supabase.from('treasury_accounts').select('*');
  if (tErr) console.log('treasury_accounts err:', tErr.message);
  else console.log('treasury_accounts:', JSON.stringify(tAccs, null, 2));

  // 10. Inspect settlements if exists
  console.log('\n--- SETTLEMENTS ---');
  const { data: setts, error: sErr } = await supabase.from('settlements').select('*');
  if (sErr) console.log('settlements err:', sErr.message);
  else console.log('settlements:', JSON.stringify(setts, null, 2));
}

inspectDb().catch(console.error);
