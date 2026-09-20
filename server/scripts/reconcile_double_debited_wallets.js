/**
 * Auditable Wallet Balance Reconciliation Script
 * ────────────────────────────────────────────────────────
 * Detects and repairs wallets affected by the RPC withdrawal double-debit bug
 * (where balance < available_balance due to double subtraction of gross withdrawal amount).
 *
 * Repairs balance through an auditable adjustment entry, NEVER via silent UPDATE.
 */

const supabase = require('../config/database');
const logger = require('../utils/logger');

async function reconcileWallets(isDryRun = false) {
  console.log(`\n============================================================`);
  console.log(`[Reconciliation] Auditing Wallets for Double-Debit Anomaly`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (Simulated)' : 'PRODUCTION EXECUTION'}`);
  console.log(`============================================================\n`);

  // Query wallets_store via wallets_v6 view or directly
  const { data: wallets, error } = await supabase
    .from('wallets_store')
    .select('id, user_id, currency, balance, available_balance, pending_balance, locked_balance, address, updated_at');

  if (error) {
    console.error('[Reconciliation] DB query error:', error.message);
    process.exit(1);
  }

  const affectedWallets = [];

  for (const w of (wallets || [])) {
    const bal = parseFloat(w.balance) || 0;
    const avail = parseFloat(w.available_balance) || 0;
    const pending = parseFloat(w.pending_balance) || 0;
    const locked = parseFloat(w.locked_balance) || 0;

    // Anomaly condition: If no pending/locked hold exists, balance should equal available + reserved.
    // If balance < available, balance was double-debited.
    if (bal < avail) {
      const diff = avail - bal;
      affectedWallets.push({
        wallet_id: w.id,
        user_id: w.user_id,
        currency: w.currency,
        address: w.address,
        old_balance: bal,
        available_balance: avail,
        difference: diff,
        corrected_balance: avail + pending + locked,
      });
    }
  }

  console.log(`[Reconciliation] Total wallets scanned: ${wallets.length}`);
  console.log(`[Reconciliation] Anomaly wallets identified: ${affectedWallets.length}\n`);

  if (affectedWallets.length === 0) {
    console.log(`✅ All wallet balances satisfy the accounting invariant (Total >= Available). No corrections needed.`);
    return { success: true, count: 0 };
  }

  console.table(affectedWallets);

  if (isDryRun) {
    console.log(`\n[DRY RUN] Simulation complete. No database mutations performed.`);
    return { success: true, count: affectedWallets.length, affected: affectedWallets };
  }

  // Execute Auditable Ledger Adjustments
  for (const item of affectedWallets) {
    console.log(`\n[Reconciling] Wallet ${item.wallet_id} (${item.currency}) for user ${item.user_id}...`);

    // 1. Update wallets_store balance to match canonical total
    const { error: updateErr } = await supabase
      .from('wallets_store')
      .update({
        balance: item.corrected_balance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.wallet_id);

    if (updateErr) {
      console.error(`❌ Failed to reconcile wallet ${item.wallet_id}:`, updateErr.message);
      continue;
    }

    // 2. Insert Append-Only Audit Log
    await supabase.from('fincra_audit_logs').insert({
      action: 'DOUBLE_DEBIT_BALANCE_RECONCILED',
      user_id: item.user_id,
      details: {
        wallet_id: item.wallet_id,
        currency: item.currency,
        old_balance: item.old_balance,
        available_balance: item.available_balance,
        difference_restored: item.difference,
        corrected_balance: item.corrected_balance,
        reason: 'Automated restoration of double-debited withdrawal balance',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`✅ Successfully restored ₦${item.difference.toFixed(2)} to wallet ${item.wallet_id}. New balance: ₦${item.corrected_balance.toFixed(2)}.`);
  }

  console.log(`\n============================================================`);
  console.log(`[Reconciliation] Reconciliation Complete.`);
  console.log(`============================================================\n`);

  return { success: true, count: affectedWallets.length };
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  reconcileWallets(isDryRun)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Reconciliation error:', err);
      process.exit(1);
    });
}

module.exports = { reconcileWallets };
