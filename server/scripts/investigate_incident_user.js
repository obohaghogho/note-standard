const supabase = require('../config/database');

const USER_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';

async function investigateIncidentUser() {
  console.log(`============================================================`);
  console.log(`Forensic Investigation: User ${USER_ID}`);
  console.log(`============================================================\n`);

  // 1. Profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', USER_ID)
    .single();

  console.log("PROFILE:", JSON.stringify(profile, null, 2));

  // 2. Wallets
  const { data: wallets } = await supabase
    .from('wallets_store')
    .select('*')
    .eq('user_id', USER_ID);

  console.log("\nWALLETS:", JSON.stringify(wallets, null, 2));

  // 3. Fincra Transactions
  const { data: fincraTxs } = await supabase
    .from('fincra_transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("\nFINCRA TRANSACTIONS:");
  console.table((fincraTxs || []).map(t => ({
    id: t.id,
    reference: t.reference,
    type: t.type,
    currency: t.currency,
    amount: t.amount,
    fee: t.fee,
    gross_amount: t.gross_amount,
    net_amount: t.net_amount,
    status: t.status,
    withdrawal_status: t.withdrawal_status,
    funds_status: t.funds_status,
    provider_status: t.provider_status,
    created_at: t.created_at
  })));

  // 4. Primary Transactions
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("\nPRIMARY TRANSACTIONS:");
  console.table((txs || []).map(t => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    fee: t.fee,
    currency: t.currency,
    status: t.status,
    reference_id: t.reference_id,
    created_at: t.created_at
  })));

  // 5. Fincra Audit Logs
  const { data: auditLogs } = await supabase
    .from('fincra_audit_logs')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("\nFINCRA AUDIT LOGS:");
  console.log(JSON.stringify(auditLogs, null, 2));
}

investigateIncidentUser()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
