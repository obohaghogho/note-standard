/**
 * Balance Correction Script
 * Corrects the inflated NGN balance for user "aghogho oboh" to match actual deposits.
 */
const supabase = require('../config/database');

async function correctBalance() {
  console.log('=== BALANCE CORRECTION ===\n');

  // 1. Find the user
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, username')
    .or('username.ilike.%aghogho%,email.ilike.%aghogho%,full_name.ilike.%aghogho%');

  if (!profiles?.length) { console.log('No user found'); return; }

  const userId = profiles[0].id;
  console.log(`User: ${userId} (${profiles[0].email})`);

  // 2. Get current NGN wallet
  const { data: wallet } = await supabase
    .from('wallets_v6')
    .select('id, balance, available_balance, pending_balance')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .maybeSingle();

  if (!wallet) { console.log('No NGN wallet found'); return; }

  const currentBal = parseFloat(wallet.balance || 0);
  console.log(`Current balance: ${currentBal}`);

  // 3. Calculate correct balance from COMPLETED deposits only
  const { data: completedDeposits } = await supabase
    .from('transactions')
    .select('amount, status')
    .eq('user_id', userId)
    .eq('type', 'DEPOSIT')
    .eq('currency', 'NGN')
    .in('status', ['COMPLETED', 'SUCCESS']);

  const correctBalance = (completedDeposits || []).reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
  console.log(`Correct balance (sum of COMPLETED NGN deposits): ${correctBalance}`);

  // 4. Account for legitimate outflows (swaps, transfers, withdrawals) 
  const { data: outflows } = await supabase
    .from('transactions')
    .select('amount, type, status')
    .eq('user_id', userId)
    .eq('currency', 'NGN')
    .in('type', ['SWAP', 'TRANSFER', 'WITHDRAWAL'])
    .in('status', ['COMPLETED', 'SUCCESS']);

  const totalOutflows = (outflows || []).reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
  console.log(`Total outflows (swaps/transfers/withdrawals): ${totalOutflows}`);

  const adjustedBalance = Math.max(0, correctBalance - totalOutflows);
  console.log(`Adjusted correct balance (deposits - outflows): ${adjustedBalance}`);

  const excess = currentBal - adjustedBalance;
  console.log(`Excess to remove: ${excess}\n`);

  if (excess <= 0) {
    console.log('No excess detected. Balance is correct.');
    return;
  }

  // 5. Apply correction
  console.log(`Correcting balance: ${currentBal} → ${adjustedBalance}`);
  
  const { error: updateErr } = await supabase
    .from('wallets_store')
    .update({ 
      balance: adjustedBalance,
      available_balance: adjustedBalance,
    })
    .eq('id', wallet.id);

  if (updateErr) {
    console.error('❌ Update failed:', updateErr.message);
    return;
  }

  console.log(`✅ Balance corrected: ${currentBal} → ${adjustedBalance}`);

  // 6. Verify
  const { data: verify } = await supabase
    .from('wallets_v6')
    .select('balance, available_balance')
    .eq('id', wallet.id)
    .single();

  console.log(`\nVerification: balance=${verify.balance}, available=${verify.available_balance}`);
}

correctBalance().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
