require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function wipeTestData() {
  console.log('--- 🚀 STARTING FULL DATABASE WIPE (FINANCIAL TABLES) ---');
  
  const tables = [
    'ledger_entries_v6',
    'ledger_transactions_v6',
    'causal_execution_queue',
    'transactions',
    'payout_requests',
    'payment_audit_logs',
    'webhook_logs',
    'webhook_events',
    'reconciliation_queue'
  ];

  for (const table of tables) {
    console.log(`Cleaning ${table}...`);
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything
    
    if (error) {
      if (error.message.includes('does not exist')) {
        console.log(`  (Table ${table} does not exist, skipping)`);
      } else {
        console.error(`  ❌ Error cleaning ${table}:`, error.message);
      }
    } else {
      console.log(`  ✅ ${table} wiped successfully.`);
    }
  }

  console.log('--- 🏁 WIPE COMPLETE. SYSTEM IS NOW CLEAN FOR LIVE USE. ---');
}

wipeTestData();
