'use strict';

const supabase = require('../config/database');

async function verifyUserBalance() {
  console.log('=== Verifying User NGN Balance in Database ===');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', 'obohoboh107@gmail.com')
    .single();

  console.log('Target Profile:', profile);

  if (!profile) {
    console.error('User not found!');
    process.exit(1);
  }

  const { data: wallets } = await supabase
    .from('wallets_store')
    .select('*')
    .eq('user_id', profile.id)
    .eq('currency', 'NGN');

  console.log('\nUser NGN Wallet Store Rows:');
  console.table(wallets);

  const { data: recentTxs } = await supabase
    .from('transactions')
    .select('id, type, amount, currency, status, display_label, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nRecent 5 Transactions:');
  console.table(recentTxs);

  process.exit(0);
}

verifyUserBalance().catch(err => {
  console.error(err);
  process.exit(1);
});
