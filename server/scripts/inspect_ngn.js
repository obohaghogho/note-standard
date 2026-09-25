const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectNgn() {
  console.log('=== NGN TRANSACTIONS DETAIL ===');
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('*')
    .or('currency.eq.NGN,currency.eq.ngn')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching NGN txs:', error);
    return;
  }

  console.log(`Found ${txs.length} NGN transactions:`);
  txs.forEach((t, i) => {
    console.log(`\n--- Transaction #${i+1} ---`);
    console.log(`ID: ${t.id}`);
    console.log(`User ID: ${t.user_id}`);
    console.log(`Type: ${t.type}`);
    console.log(`Status: ${t.status}`);
    console.log(`Amount: ${t.amount} ${t.currency}`);
    console.log(`Fee column: ${t.fee}`);
    console.log(`Ref ID: ${t.reference_id}`);
    console.log(`Provider Ref: ${t.provider_reference}`);
    console.log(`Provider: ${t.provider}`);
    console.log(`Created At: ${t.created_at}`);
    console.log(`Metadata:`, JSON.stringify(t.metadata, null, 2));
    console.log(`Fee Breakdown:`, JSON.stringify(t.transaction_fee_breakdown, null, 2));
  });

  // Check revenue_logs for NGN
  console.log('\n=== REVENUE LOGS FOR NGN ===');
  const { data: rLogs } = await supabase.from('revenue_logs').select('*').eq('currency', 'NGN');
  console.log('NGN Revenue Logs:', rLogs);

  // Check platform_wallets
  console.log('\n=== PLATFORM WALLETS ===');
  const { data: pWallets } = await supabase.from('platform_wallets').select('*');
  console.log('Platform Wallets:', pWallets);
}

inspectNgn();
