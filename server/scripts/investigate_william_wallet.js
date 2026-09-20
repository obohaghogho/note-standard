const supabase = require('../config/database');

async function investigateWilliam() {
  console.log(`============================================================`);
  console.log(`Forensic Investigation: William David Wallet`);
  console.log(`============================================================\n`);

  // 1. Fetch user profile
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .or('email.ilike.%williams%,email.ilike.%william%,full_name.ilike.%william%');

  if (pErr) {
    console.error('Profile fetch error:', pErr.message);
  } else {
    console.log(`Found ${profiles.length} matching profile(s):`);
    console.table(profiles.map(p => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      username: p.username,
      created_at: p.created_at
    })));
  }

  const williamId = '587b4497-1ab9-4293-b986-d60e0d1422d9';

  // 2. Fetch William's wallets in wallets_store
  const { data: wallets, error: wErr } = await supabase
    .from('wallets_store')
    .select('*')
    .eq('user_id', williamId);

  console.log(`\nWilliam's Wallets in wallets_store:`);
  if (wErr) {
    console.error('Wallet fetch error:', wErr.message);
  } else {
    console.table(wallets.map(w => ({
      id: w.id,
      currency: w.currency,
      balance: w.balance,
      available_balance: w.available_balance,
      pending_balance: w.pending_balance,
      locked_balance: w.locked_balance,
      address: w.address,
      updated_at: w.updated_at
    })));
  }

  // 3. Fetch William's fincra_transactions
  const { data: fincraTxs, error: fErr } = await supabase
    .from('fincra_transactions')
    .select('*')
    .eq('user_id', williamId)
    .order('created_at', { ascending: false });

  console.log(`\nWilliam's Fincra Transactions:`);
  if (fErr) {
    console.error('Fincra transactions error:', fErr.message);
  } else {
    console.table(fincraTxs.map(t => ({
      id: t.id,
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

  // 4. Fetch William's primary transactions
  const { data: txs, error: tErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', williamId)
    .order('created_at', { ascending: false });

  console.log(`\nWilliam's Primary Transactions:`);
  if (tErr) {
    console.error('Primary transactions error:', tErr.message);
  } else {
    console.table((txs || []).map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      reference_id: t.reference_id,
      created_at: t.created_at
    })));
  }

  // 5. Fetch William's audit logs
  const { data: auditLogs } = await supabase
    .from('fincra_audit_logs')
    .select('*')
    .eq('user_id', williamId)
    .order('created_at', { ascending: false });

  console.log(`\nWilliam's Fincra Audit Logs:`);
  console.log(JSON.stringify(auditLogs, null, 2));
}

investigateWilliam()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error investigating William:', err);
    process.exit(1);
  });
