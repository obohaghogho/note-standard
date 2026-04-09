const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkWallet() {
  const userId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
  console.log('--- Checking Wallet for Peter King ---');
  const { data, error } = await supabase
    .from('wallets_store')
    .select('*')
    .eq('user_id', userId);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));

  console.log('\n--- Checking Transactions for Peter King ---');
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  console.log(JSON.stringify(txs, null, 2));
}

checkWallet();
