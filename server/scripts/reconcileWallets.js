require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reconcile() {
  console.log('🔍 Starting Sovereign Ledger Reconciliation...');

  // 1. Fetch all wallets
  const { data: wallets, error: wError } = await supabase
    .from('wallets_store')
    .select('id, balance, currency, user_id');

  if (wError) throw wError;

  console.log(`Found ${wallets.length} wallets. Verifying against v6 Ledger...`);

  let corrections = 0;

  for (const wallet of wallets) {
    // 2. Fetch Truth from v6 Ledger
    const { data: entries, error: lError } = await supabase
      .from('ledger_entries_v6')
      .select('amount')
      .eq('wallet_id', wallet.id);

    if (lError) {
        console.error(`Error fetching ledger for ${wallet.id}:`, lError.message);
        continue;
    }

    const truthSum = entries.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const materialized = Number(wallet.balance) || 0;
    const target = Math.max(0, truthSum); // Enforce non-negative floor

    const drift = Math.abs(materialized - target);

    if (drift > 0.0000000001) {
      console.log(`⚠️  Drift detected for wallet ${wallet.id} (${wallet.currency})`);
      console.log(`   User: ${wallet.user_id}`);
      console.log(`   Materialized: ${materialized}`);
      console.log(`   Ledger Truth: ${truthSum} (Target: ${target})`);
      console.log(`   Drift: ${drift}`);

      // 3. EXECUTE RE-MATERIALIZATION
      // We use the RPC specifically designed for this to ensure trigger sync
      const { error: syncError } = await supabase.rpc('sync_wallet_balance_from_ledger', {
        p_wallet_id: wallet.id
      });

      if (syncError) {
        console.error(`   ❌ Sync Error: ${syncError.message}`);
      } else {
        // Verify update
        const { data: updated } = await supabase
            .from('wallets_store')
            .select('balance')
            .eq('id', wallet.id)
            .single();
            
        console.log(`   ✅ Corrected. New Balance: ${updated.balance}`);
        corrections++;
      }
    }
  }

  console.log(`\n✅ Reconciliation complete. Total Corrections: ${corrections}`);
}

reconcile().catch(err => {
  console.error('Fatal reconciliation error:', err);
  process.exit(1);
});
