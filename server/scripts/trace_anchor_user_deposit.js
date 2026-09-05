'use strict';

const supabase = require('../config/database');

async function traceAnchorUserDeposit() {
  console.log('========================================================================');
  console.log('     FORENSIC TRACE OF RECENT ANCHOR DEPOSIT & WALLET BALANCE UPDATE   ');
  console.log('========================================================================\n');

  // 1. Fetch user profile for Aghogho Jossy Oboh
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .or('email.eq.obohoboh107@gmail.com,email.eq.onomejohn107@gmail.com')
    .order('created_at', { ascending: false });

  console.log('Target Users found:', profile);

  const userIds = (profile || []).map(p => p.id);

  // 2. Fetch recent notifications for these users
  const { data: notifications, error: nErr } = await supabase
    .from('notifications')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n--- Recent Notifications ---');
  console.table((notifications || []).map(n => ({
    id: n.id,
    user_id: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type,
    created_at: n.created_at
  })));

  // 3. Fetch recent transactions for Anchor / deposits
  const { data: transactions, error: tErr } = await supabase
    .from('transactions')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n--- Recent Transactions ---');
  console.table((transactions || []).map(t => ({
    id: t.id,
    user_id: t.user_id,
    type: t.type,
    status: t.status,
    amount: t.amount,
    currency: t.currency,
    provider: t.provider,
    reference_id: t.reference_id,
    provider_reference: t.provider_reference,
    created_at: t.created_at
  })));

  // 4. Fetch NGN wallets from wallets_store and wallets
  const { data: walletsStore, error: wsErr } = await supabase
    .from('wallets_store')
    .select('*')
    .in('user_id', userIds);

  console.log('\n--- Wallets Store Records ---');
  console.table((walletsStore || []).map(w => ({
    id: w.id,
    user_id: w.user_id,
    currency: w.currency,
    balance: w.balance,
    available_balance: w.available_balance,
    updated_at: w.updated_at
  })));

  // Also check public.wallets if it exists
  const { data: walletsTable } = await supabase
    .from('wallets')
    .select('*')
    .in('user_id', userIds);

  if (walletsTable && walletsTable.length > 0) {
    console.log('\n--- Public Wallets Table Records ---');
    console.table(walletsTable.map(w => ({
      id: w.id,
      user_id: w.user_id,
      currency: w.currency,
      balance: w.balance,
      updated_at: w.updated_at
    })));
  }

  process.exit(0);
}

traceAnchorUserDeposit().catch(err => {
  console.error('Forensic trace error:', err);
  process.exit(1);
});
