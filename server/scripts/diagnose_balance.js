/**
 * Balance Diagnostic Script
 * Finds user "aghogho oboh" and audits their wallet balance vs actual deposits.
 */
const supabase = require('../config/database');

async function diagnose() {
  console.log('=== BALANCE DIAGNOSTIC ===\n');

  // 1. Find the user
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .or('username.ilike.%aghogho%,email.ilike.%aghogho%,full_name.ilike.%aghogho%');

  if (pErr) { console.error('Profile query error:', pErr.message); return; }
  if (!profiles?.length) { console.log('No user found matching "aghogho"'); return; }

  console.log('Found users:');
  profiles.forEach(p => console.log(`  - ${p.id} | ${p.email} | ${p.username} | ${p.full_name}`));

  const userId = profiles[0].id;
  console.log(`\nUsing user: ${userId}\n`);

  // 2. Get wallets
  const { data: wallets } = await supabase
    .from('wallets_v6')
    .select('id, currency, balance, available_balance, pending_balance, locked_balance')
    .eq('user_id', userId);

  console.log('Wallets:');
  (wallets || []).forEach(w => {
    console.log(`  ${w.currency}: balance=${w.balance}, available=${w.available_balance}, pending=${w.pending_balance}`);
  });

  // 3. Get ALL deposit transactions
  const { data: deposits } = await supabase
    .from('transactions')
    .select('id, amount, currency, status, type, payment_status, wallet_credit_status, reference_id, provider, created_at')
    .eq('user_id', userId)
    .eq('type', 'DEPOSIT')
    .order('created_at', { ascending: true });

  console.log(`\nDeposit Transactions (${(deposits || []).length} total):`);
  let totalCompleted = 0;
  let totalPending = 0;
  (deposits || []).forEach(d => {
    const amt = parseFloat(d.amount || 0);
    if (d.status === 'COMPLETED' || d.status === 'SUCCESS') totalCompleted += amt;
    else totalPending += amt;
    console.log(`  ${d.created_at} | ${d.amount} ${d.currency} | status=${d.status} | payment=${d.payment_status} | credit=${d.wallet_credit_status} | ref=${d.reference_id} | provider=${d.provider}`);
  });

  console.log(`\nTotal COMPLETED deposits: ${totalCompleted}`);
  console.log(`Total PENDING deposits: ${totalPending}`);

  // 4. Get ledger entries
  const { data: ledgerEntries } = await supabase
    .from('ledger_entries_v6')
    .select('id, wallet_id, amount, side, currency, created_at')
    .in('wallet_id', (wallets || []).map(w => w.id))
    .order('created_at', { ascending: true });

  console.log(`\nLedger Entries (${(ledgerEntries || []).length} total):`);
  let totalCredits = 0;
  let totalDebits = 0;
  (ledgerEntries || []).forEach(e => {
    const amt = parseFloat(e.amount || 0);
    if (e.side === 'CREDIT' || amt > 0) totalCredits += Math.abs(amt);
    else totalDebits += Math.abs(amt);
    console.log(`  ${e.created_at} | ${e.amount} ${e.currency} | side=${e.side} | wallet=${e.wallet_id}`);
  });

  console.log(`\nTotal CREDITS in ledger: ${totalCredits}`);
  console.log(`Total DEBITS in ledger: ${totalDebits}`);
  console.log(`Net ledger balance: ${totalCredits - totalDebits}`);

  // 5. Summary
  const ngnWallet = (wallets || []).find(w => w.currency === 'NGN');
  if (ngnWallet) {
    const currentBal = parseFloat(ngnWallet.balance || 0);
    const excess = currentBal - totalCompleted;
    console.log(`\n=== SUMMARY (NGN) ===`);
    console.log(`Current wallet balance: ${currentBal}`);
    console.log(`Sum of COMPLETED deposits: ${totalCompleted}`);
    console.log(`Excess amount: ${excess}`);
    console.log(`Correct balance should be: ${totalCompleted}`);
    
    if (excess > 0) {
      console.log(`\n⚠️  EXCESS DETECTED: ${excess} NGN needs correction`);
    }
  }
}

diagnose().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
