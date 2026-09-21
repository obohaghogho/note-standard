const supabase = require('../config/database');

async function dumpRealUserData() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .not('email', 'like', '%loadtest%');

  console.log("PROFILES:");
  console.log(JSON.stringify(profiles, null, 2));

  const userIds = (profiles || []).map(p => p.id);

  const { data: wallets } = await supabase
    .from('wallets_store')
    .select('*')
    .in('user_id', userIds);

  console.log("\nWALLETS:");
  console.log(JSON.stringify(wallets, null, 2));

  const { data: fincraTxs } = await supabase
    .from('fincra_transactions')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  console.log("\nFINCRA TRANSACTIONS:");
  console.log(JSON.stringify(fincraTxs, null, 2));

  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  console.log("\nPRIMARY TRANSACTIONS:");
  console.log(JSON.stringify(txs, null, 2));
}

dumpRealUserData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
