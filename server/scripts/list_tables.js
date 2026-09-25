const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllTables() {
  console.log('=== LISTING DATABASE TABLES & VIEWS ===');
  
  // Query pg_tables via RPC or by checking known table names
  const knownTables = [
    'transactions', 'wallets_store', 'wallets_v6', 'revenue_logs', 'commissions',
    'platform_wallets', 'treasury_accounts', 'fincra_transactions', 'deposit_sessions',
    'manual_deposits', 'payments', 'bank_accounts', 'fincra_wallet_links',
    'profiles', 'users', 'commission_settings', 'admin_settings',
    'journal_entries', 'journal_lines', 'ledger_accounts', 'ledger_entries',
    'audit_logs', 'fincra_webhook_logs', 'swap_quotes'
  ];

  for (const t of knownTables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table '${t}': MISSING/ERROR (${error.message})`);
    } else {
      console.log(`Table '${t}': EXISTS (${count} rows)`);
    }
  }
}

listAllTables();
