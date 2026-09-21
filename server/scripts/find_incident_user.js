const supabase = require('../config/database');

async function findIncidentSpecific() {
  console.log(`============================================================`);
  console.log(`Detailed Forensic Investigation: ₦210 / ₦160 Incident Search`);
  console.log(`============================================================\n`);

  // 1. Search fincra_transactions for amount 210, 160, 260 (210+50 fee), 210 (160+50 fee), etc.
  const { data: fincraTxs, error: fErr } = await supabase
    .from('fincra_transactions')
    .select('*')
    .or('amount.eq.210,amount.eq.160,gross_amount.eq.210,gross_amount.eq.160,gross_amount.eq.260,gross_amount.eq.210');

  console.log(`Matching Fincra Transactions:`, fincraTxs);

  // 2. Search all fincra_transactions ordered by created_at DESC
  const { data: allFincra, error: afErr } = await supabase
    .from('fincra_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(`Recent 20 Fincra Transactions:`);
  console.table(allFincra);

  // 3. Search transactions table for amount 210 or 160
  const { data: txs, error: tErr } = await supabase
    .from('transactions')
    .select('*')
    .or('amount.eq.210,amount.eq.160')
    .order('created_at', { ascending: false });

  console.log(`Matching Primary Transactions (210/160):`, txs);

  // 4. Search all transactions table (recent 30)
  const { data: recentTxs } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log(`Recent 30 Primary Transactions:`);
  console.table(recentTxs);

  // 5. Search wallets_store where balance != available_balance or balance > 0
  const { data: nonZeroWallets } = await supabase
    .from('wallets_store')
    .select('*')
    .or('balance.gt.0,available_balance.gt.0');

  console.log(`Non-zero Wallets in wallets_store:`);
  console.table(nonZeroWallets);

  // 6. Search all tables in Supabase related to withdrawals or transfers or ledger
  // Check if there are other tables like payout_transactions, withdrawal_requests, ledger_entries, etc.
  const { data: auditLogs } = await supabase
    .from('fincra_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log(`\nRecent Fincra Audit Logs:`);
  console.log(JSON.stringify(auditLogs, null, 2));
}

findIncidentSpecific()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
