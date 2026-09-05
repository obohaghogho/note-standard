'use strict';

const supabase = require('../config/database');

async function deepTraceAnchorUser() {
  console.log('=== Deep Trace for Anchor User Deposit ===');

  // Find profile for obohoboh107@gmail.com
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'obohoboh107@gmail.com')
    .single();

  console.log('Profile:', profile);

  if (!profile) {
    console.error('Profile not found for obohoboh107@gmail.com');
    process.exit(1);
  }

  const userId = profile.id;

  // 1. Get all transactions for this user
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  console.log(`\n--- Transactions for ${profile.email} (${txs ? txs.length : 0}) ---`);
  console.table(txs || []);

  // 2. Get all wallets in wallets_store for this user
  const { data: wStore } = await supabase
    .from('wallets_store')
    .select('*')
    .eq('user_id', userId);

  console.log(`\n--- wallets_store rows for ${profile.email} (${wStore ? wStore.length : 0}) ---`);
  console.table(wStore || []);

  // 3. Get all wallets in public.wallets for this user
  const { data: wPublic } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId);

  console.log(`\n--- public.wallets rows for ${profile.email} (${wPublic ? wPublic.length : 0}) ---`);
  console.table(wPublic || []);

  // 4. Get recent notifications
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`\n--- Notifications for ${profile.email} ---`);
  console.table(notifs || []);

  process.exit(0);
}

deepTraceAnchorUser().catch(err => {
  console.error(err);
  process.exit(1);
});
