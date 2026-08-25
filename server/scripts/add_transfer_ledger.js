/**
 * Add the missing ₦250 transfer deposit ledger entry using proper double-entry.
 * Uses the same pattern as confirm_deposit_v7: CREDIT to user wallet, DEBIT from settlement wallet.
 */
const supabase = require('../config/database');

async function addTransferLedger() {
  const USER_ID = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
  const WALLET_ID = '52b58e94-6e78-4ded-9d76-0b5ccd4d49c2';

  // Use SETTLEMENT_PAYSTACK_NGN (confirm_deposit_v7 falls back to this)
  const sysWalletId = 'ebad235f-2d29-4fe0-8a59-29823ed3ae14';
  console.log(`System settlement wallet: ${sysWalletId}`);

  const idempotencyKey = `NS-TRANSFER-250-CORRECTION-${Date.now()}`;
  
  const { data: txId, error: rpcErr } = await supabase.rpc('execute_ledger_transaction_v6', {
    p_idempotency_key: idempotencyKey,
    p_type: 'DEPOSIT',
    p_status: 'SETTLED',
    p_metadata: { reason: 'Manual correction: ₦250 bank transfer deposit never ledger-credited', corrected_at: new Date().toISOString() },
    p_entries: [
      { wallet_id: WALLET_ID, user_id: USER_ID, currency: 'NGN', amount: 250, side: 'CREDIT' },
      { wallet_id: sysWalletId, user_id: '00000000-0000-0000-0000-000000000000', currency: 'NGN', amount: -250, side: 'DEBIT' }
    ]
  });

  if (rpcErr) {
    console.error('RPC error:', rpcErr.message);
    return;
  }

  console.log('✅ Ledger transaction created:', txId);

  // Verify balance (trigger should have auto-recalculated to 1500)
  const { data: wallet } = await supabase
    .from('wallets_v6')
    .select('balance, available_balance')
    .eq('id', WALLET_ID)
    .single();

  console.log(`Balance after ledger entry: ${wallet.balance} (available: ${wallet.available_balance})`);
}

addTransferLedger().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
