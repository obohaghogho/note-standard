const supabase = require('../config/database');

const USER_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';

async function printTables() {
  const { data: fincraTxs } = await supabase
    .from('fincra_transactions')
    .select('id, reference, type, currency, amount, fee, gross_amount, net_amount, status, withdrawal_status, funds_status, provider_status, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("=== FINCRA TRANSACTIONS ===");
  console.log(JSON.stringify(fincraTxs, null, 2));

  const { data: txs } = await supabase
    .from('transactions')
    .select('id, type, amount, fee, currency, status, reference_id, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("\n=== PRIMARY TRANSACTIONS ===");
  console.log(JSON.stringify(txs, null, 2));
}

printTables()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
