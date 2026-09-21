const supabase = require('../config/database');

async function inspectAllWithdrawalUsers() {
  console.log(`============================================================`);
  console.log(`Forensic Investigation: Real User Transactions & Wallets`);
  console.log(`============================================================\n`);

  // Fetch all non-loadtest profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .not('email', 'like', '%loadtest%');

  console.log(`Real User Profiles (${profiles ? profiles.length : 0}):`);
  if (profiles) {
    console.table(profiles.map(p => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      username: p.username,
      created_at: p.created_at
    })));
  }

  const userIds = (profiles || []).map(p => p.id);

  // Fetch wallets for these users
  const { data: wallets } = await supabase
    .from('wallets_store')
    .select('*')
    .in('user_id', userIds);

  console.log(`\nReal User Wallets:`);
  if (wallets) {
    console.table(wallets.map(w => ({
      id: w.id,
      user_id: w.user_id,
      currency: w.currency,
      balance: w.balance,
      available_balance: w.available_balance,
      pending_balance: w.pending_balance,
      reserved_balance: w.reserved_balance,
      updated_at: w.updated_at
    })));
  }

  // Fetch fincra_transactions for these users
  const { data: fincraTxs } = await supabase
    .from('fincra_transactions')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  console.log(`\nReal User Fincra Transactions:`);
  if (fincraTxs) {
    console.table(fincraTxs.map(t => ({
      id: t.id,
      user_id: t.user_id,
      reference: t.reference,
      type: t.type,
      currency: t.currency,
      amount: t.amount,
      gross_amount: t.gross_amount,
      fee: t.fee,
      net_amount: t.net_amount,
      status: t.status,
      created_at: t.created_at
    })));
  }

  // Fetch transactions table for these users
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  console.log(`\nReal User Primary Transactions:`);
  if (txs) {
    console.table((txs || []).map(t => ({
      id: t.id,
      user_id: t.user_id,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      reference_id: t.reference_id,
      created_at: t.created_at
    })));
  }

  // Fetch audit logs for these users
  const { data: auditLogs } = await supabase
    .from('fincra_audit_logs')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  console.log(`\nReal User Fincra Audit Logs:`);
  console.log(JSON.stringify(auditLogs, null, 2));
}

inspectAllWithdrawalUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
