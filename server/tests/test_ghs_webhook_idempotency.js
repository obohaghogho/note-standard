'use strict';

const crypto = require('crypto');
const supabase = require('../config/database');
const { processFincraWebhook } = require('../services/fincra/webhook');
const { FincraDuplicateEventError } = require('../services/fincra/errors');
const walletService = require('../services/walletService');

async function runGhsWebhookAudit() {
  console.log('--- Starting GHS Webhook Settlement & Idempotency Audit ---');

  const testUserId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd'; // test profile

  if (!process.env.FINCRA_WEBHOOK_SECRET) {
    process.env.FINCRA_WEBHOOK_SECRET = 'dummy_test_webhook_secret_for_idempotency_audit';
  }
  const webhookSecret = process.env.FINCRA_WEBHOOK_SECRET;

  // 1. Initial GHS Wallet Balance
  const ghsWallet = await walletService.createWallet(testUserId, 'GHS', 'native');
  const initialBalance = parseFloat(ghsWallet.balance || 0);
  console.log(`1. Initial GHS Wallet Balance: ${initialBalance} GHS (Wallet ID: ${ghsWallet.id})`);

  // 2. Create a pending GHS deposit transaction
  const depositAmount = 100;
  const providerRef = `ref_ghs_test_${Date.now()}`;

  const { data: tx, error: txErr } = await supabase.from('transactions').insert({
    user_id: testUserId,
    wallet_id: ghsWallet.id,
    amount: depositAmount,
    currency: 'GHS',
    type: 'DEPOSIT',
    status: 'PENDING',
    payment_status: 'PAYMENT_PENDING',
    receipt_status: 'NOT_PROVIDED',
    wallet_credit_status: 'WALLET_CREDIT_PENDING',
    idempotency_key: providerRef,
    reference_id: providerRef,
    provider: 'fincra',
    display_label: 'GHS Webhook Settlement Test Deposit',
    metadata: {
      provider: 'fincra',
      display_ref: providerRef,
      test: true
    }
  }).select('*').single();

  if (txErr) {
    throw new Error(`Failed to create test transaction: ${txErr.message}`);
  }

  console.log(`2. Created Pending GHS Deposit Transaction: ${tx.id} (Ref: ${providerRef}, Amount: 100 GHS)`);

  // 3. Construct Fincra Webhook Payload & Signature
  const payload = {
    event: 'collection.successful',
    data: {
      reference: providerRef,
      customerReference: providerRef,
      merchantReference: providerRef,
      amount: depositAmount,
      currency: 'GHS',
      status: 'successful'
    }
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha512', webhookSecret).update(rawBody).digest('hex');
  const headers = { 'x-webhook-signature': signature };

  // 4. Send Webhook #1
  console.log('3. Processing Webhook #1 (First Delivery)...');
  await processFincraWebhook(headers, rawBody, payload);

  // Check updated balance
  const { data: updatedWallet } = await supabase.from('wallets_store').select('balance').eq('id', ghsWallet.id).single();
  const updatedBalance = parseFloat(updatedWallet.balance || 0);
  console.log(`✅ Balance after Webhook #1: ${updatedBalance} GHS (Credited: +${updatedBalance - initialBalance} GHS)`);

  if (updatedBalance !== initialBalance + depositAmount) {
    throw new Error(`Expected balance to be ${initialBalance + depositAmount}, but got ${updatedBalance}`);
  }

  // 5. Send Webhook #2 (Replay Attack / Duplicate Webhook)
  console.log('4. Processing Webhook #2 (Duplicate Replay Attack)...');
  let duplicateCaught = false;
  try {
    await processFincraWebhook(headers, rawBody, payload);
  } catch (err) {
    if (err instanceof FincraDuplicateEventError || err.name === 'FincraDuplicateEventError' || err.message.includes('Duplicate')) {
      duplicateCaught = true;
      console.log(`✅ Duplicate webhook rejected correctly: ${err.message}`);
    } else {
      throw err;
    }
  }

  if (!duplicateCaught) {
    throw new Error('FAILED: Duplicate webhook was NOT rejected by idempotency check!');
  }

  // Verify balance remains unchanged after replay
  const { data: finalWallet } = await supabase.from('wallets_store').select('balance').eq('id', ghsWallet.id).single();
  const finalBalance = parseFloat(finalWallet.balance || 0);
  console.log(`✅ Balance after Replay Webhook #2: ${finalBalance} GHS (Unchanged)`);

  if (finalBalance !== updatedBalance) {
    throw new Error(`CRITICAL LEDGER BUG: Replay webhook mutated balance! Was ${updatedBalance}, now ${finalBalance}`);
  }

  // Cleanup test transaction
  await supabase.from('transactions').delete().eq('reference_id', providerRef);
  await supabase.from('fincra_webhook_logs').delete().eq('event_hash', crypto.createHash('sha256').update(rawBody).digest('hex'));

  console.log('🎉 GHS Webhook Ingestion, Signature Verification, Idempotency, and Ledger Credit Test PASSED!');
  process.exit(0);
}

runGhsWebhookAudit().catch(err => {
  console.error('❌ GHS Webhook Audit Failed:', err);
  process.exit(1);
});
