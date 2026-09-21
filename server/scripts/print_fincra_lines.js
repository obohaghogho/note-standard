const supabase = require('../config/database');

const USER_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';

async function printFincraTxs() {
  const { data: fincraTxs } = await supabase
    .from('fincra_transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: true });

  console.log("=== FINCRA TRANSACTIONS FOR USER ===");
  fincraTxs.forEach((t, i) => {
    console.log(`${i+1}. ID: ${t.id} | Ref: ${t.reference} | Type: ${t.type} | Amount: ${t.amount} | Fee: ${t.fee} | Gross: ${t.gross_amount} | Status: ${t.status} | W_Status: ${t.withdrawal_status} | Created: ${t.created_at}`);
  });
}

printFincraTxs()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
