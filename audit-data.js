require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTestData() {
  try {
    // 1. Check for non-zero balances in the v6 view
    const { data: highBalances, error: walletError } = await supabase
      .from('wallets_v6')
      .select('user_id, balance, currency')
      .gt('balance', 0)
      .limit(10);
    
    if (walletError) throw walletError;

    // 2. Count transactions in the v6 ledger
    const { count: ledgerCount, error: ledgerError } = await supabase
      .from('ledger_entries_v6')
      .select('*', { count: 'exact', head: true });

    console.log('--- Database Audit ---');
    console.log(`Total Ledger Entries (v6): ${ledgerCount || 0}`);
    console.log('Sample Non-Zero Balances:', highBalances);

  } catch (err) {
    console.error('Audit failed:', err.message);
  }
}

checkTestData();
