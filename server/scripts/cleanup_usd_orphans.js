const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function cleanupUsdOrphans() {
  console.log('================================================================================');
  console.log(' 🧹 CLEANING UP 13 ORPHANED USD TEST REVENUE LOGS (TX_NOT_FOUND)');
  console.log('================================================================================\n');

  // Fetch all USD revenue_logs
  const { data: revLogs } = await supabase
    .from('revenue_logs')
    .select('id, source_transaction_id, amount, created_at')
    .or('currency.eq.USD,currency.eq.usd');

  const orphanIds = [];
  for (const r of revLogs) {
    if (!r.source_transaction_id) {
      orphanIds.push(r.id);
      continue;
    }
    const { data: tx } = await supabase.from('transactions').select('id').eq('id', r.source_transaction_id).maybeSingle();
    if (!tx) {
      orphanIds.push(r.id);
    }
  }

  console.log(`Identified ${orphanIds.length} orphaned USD revenue_logs (totaling $${orphanIds.length * 10}):`);
  console.log('Orphan Log IDs:', orphanIds);

  if (orphanIds.length > 0) {
    const { error: delErr } = await supabase
      .from('revenue_logs')
      .delete()
      .in('id', orphanIds);

    if (delErr) {
      console.error('Error deleting orphan revenue_logs:', delErr);
      return;
    }
    console.log(`\n✅ Successfully deleted ${orphanIds.length} orphaned test revenue_logs.`);
  }

  // Recalculate true USD platform revenue from remaining valid logs
  const { data: validLogs } = await supabase
    .from('revenue_logs')
    .select('amount')
    .or('currency.eq.USD,currency.eq.usd');

  const trueUsdRevenue = (validLogs || []).reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

  // Update wallets_store for USD platform wallet
  await supabase
    .from('wallets_store')
    .update({
      balance: trueUsdRevenue,
      available_balance: trueUsdRevenue,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', SYSTEM_USER_ID)
    .eq('currency', 'USD');

  console.log(`\n✅ Platform Revenue Wallet for USD updated to true reconciled balance: USD ${trueUsdRevenue.toFixed(2)}`);
}

cleanupUsdOrphans().catch(console.error);
