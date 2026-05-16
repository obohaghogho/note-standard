require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepWipe() {
  console.log('--- 🚀 STARTING DEEP WALLET BALANCE RESET ---');
  
  // 1. Reset wallets_store balances
  console.log('Resetting wallets_store balances...');
  const { error: walletError } = await supabase
    .from('wallets_store')
    .update({ 
      balance: 0, 
      available_balance: 0,
      last_transaction_at: null
    })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (walletError) {
    console.error('  ❌ Error resetting wallets_store:', walletError.message);
  } else {
    console.log('  ✅ wallets_store balances reset to 0.');
  }

  // 2. Wipe any other surviving tables
  const tables = ['wallets_store_v6', 'ledger_entries_v6', 'ledger_transactions_v6']; // Check if these exist
  for (const table of tables) {
    console.log(`Cleaning ${table}...`);
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  console.log('--- 🏁 DEEP WIPE COMPLETE. ---');
}

deepWipe();
