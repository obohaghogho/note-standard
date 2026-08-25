/**
 * LEDGER CLEANUP SCRIPT
 * ─────────────────────
 * The root issue: wallets_store.balance is recalculated from ledger_entries_v6
 * on every new entry (via trg_ledger_sovereign_sync trigger).
 * 
 * So we must delete the duplicate/phantom ledger entries — not just fix the balance.
 * 
 * Strategy:
 *  1. Find all ledger entries for user's NGN wallet
 *  2. Cross-reference with COMPLETED transactions to identify legitimate entries
 *  3. Delete all entries from the duplicate credit batches (Aug 8 rapid-fire)
 *  4. Keep only entries that correspond to real deposits (₦1,000 + ₦250)
 *  5. Trigger balance recalculation
 */
const supabase = require('../config/database');

const USER_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
const NGN_WALLET_ID = '52b58e94-6e78-4ded-9d76-0b5ccd4d49c2';

async function cleanLedger() {
  console.log('=== LEDGER CLEANUP ===\n');

  // 1. Get ALL NGN ledger entries for this wallet
  const { data: entries } = await supabase
    .from('ledger_entries_v6')
    .select('id, transaction_id, wallet_id, amount, side, currency, created_at')
    .eq('wallet_id', NGN_WALLET_ID)
    .order('created_at', { ascending: true });

  console.log(`Total NGN ledger entries: ${entries.length}`);

  // 2. Get the legitimate transaction IDs (the two real deposits)
  const { data: realTxs } = await supabase
    .from('transactions')
    .select('id, amount, reference_id, status, created_at')
    .eq('user_id', USER_ID)
    .eq('type', 'DEPOSIT')
    .eq('currency', 'NGN')
    .in('status', ['COMPLETED', 'SUCCESS']);

  console.log(`\nReal COMPLETED deposit transactions:`);
  realTxs.forEach(t => console.log(`  ${t.id} | ${t.amount} NGN | ref=${t.reference_id} | ${t.created_at}`));

  // 3. Get the ledger transaction IDs linked to real deposits
  // Each confirm_deposit creates a ledger_transactions_v6 entry with an idempotency_key
  // that matches the transaction reference_id
  const { data: realLedgerTxs } = await supabase
    .from('ledger_transactions_v6')
    .select('id, idempotency_key, type, created_at')
    .in('idempotency_key', realTxs.map(t => t.reference_id || t.id));

  console.log(`\nReal ledger transactions:`);
  (realLedgerTxs || []).forEach(lt => console.log(`  ${lt.id} | key=${lt.idempotency_key} | ${lt.created_at}`));

  // 4. Identify which ledger entries to KEEP
  const realLedgerTxIds = new Set((realLedgerTxs || []).map(lt => lt.id));
  
  const entriesToKeep = entries.filter(e => realLedgerTxIds.has(e.transaction_id));
  const entriesToDelete = entries.filter(e => !realLedgerTxIds.has(e.transaction_id));

  console.log(`\nEntries to KEEP: ${entriesToKeep.length}`);
  entriesToKeep.forEach(e => console.log(`  ✅ ${e.created_at} | ${e.amount} ${e.currency} | tx=${e.transaction_id}`));

  console.log(`\nEntries to DELETE: ${entriesToDelete.length}`);
  entriesToDelete.forEach(e => console.log(`  🗑️  ${e.created_at} | ${e.amount} ${e.currency} | tx=${e.transaction_id}`));

  // 5. Calculate what balance SHOULD be after cleanup
  const keepSum = entriesToKeep.reduce((s, e) => s + parseFloat(e.amount), 0);
  console.log(`\nExpected balance after cleanup: ${keepSum}`);

  if (entriesToDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // 6. Delete the phantom entries
  const deleteIds = entriesToDelete.map(e => e.id);
  
  // Also get the parent ledger_transactions_v6 IDs to clean up
  const phantomTxIds = [...new Set(entriesToDelete.map(e => e.transaction_id))];

  console.log(`\nDeleting ${deleteIds.length} phantom ledger entries...`);
  
  // Delete in batches (Supabase has limits)
  for (let i = 0; i < deleteIds.length; i += 50) {
    const batch = deleteIds.slice(i, i + 50);
    const { error } = await supabase
      .from('ledger_entries_v6')
      .delete()
      .in('id', batch);
    if (error) console.error(`  Delete batch error: ${error.message}`);
  }

  // Also delete the parent transaction headers
  console.log(`Deleting ${phantomTxIds.length} phantom ledger transaction headers...`);
  for (let i = 0; i < phantomTxIds.length; i += 50) {
    const batch = phantomTxIds.slice(i, i + 50);
    await supabase
      .from('ledger_transactions_v6')
      .delete()
      .in('id', batch);
  }

  // 7. Force balance recalculation from cleaned ledger
  // Call the sync function via RPC
  console.log('\nRecalculating balance from cleaned ledger...');
  const { error: rpcErr } = await supabase.rpc('sync_wallet_balance_from_ledger', {
    p_wallet_id: NGN_WALLET_ID
  });

  if (rpcErr) {
    console.error('RPC sync error:', rpcErr.message);
    // Fallback: manually set balance = sum of remaining entries
    await supabase
      .from('wallets_store')
      .update({ balance: keepSum, available_balance: keepSum })
      .eq('id', NGN_WALLET_ID);
    console.log('Fallback: manually set balance to', keepSum);
  }

  // 8. Verify
  const { data: verify } = await supabase
    .from('wallets_v6')
    .select('balance, available_balance')
    .eq('id', NGN_WALLET_ID)
    .single();

  console.log(`\n✅ FINAL BALANCE: ${verify.balance} (available: ${verify.available_balance})`);

  // 9. Verify remaining entries
  const { data: remaining } = await supabase
    .from('ledger_entries_v6')
    .select('id')
    .eq('wallet_id', NGN_WALLET_ID);

  console.log(`Remaining NGN ledger entries: ${remaining.length}`);
}

cleanLedger().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
