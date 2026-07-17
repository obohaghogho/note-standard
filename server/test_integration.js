require('dotenv').config({ path: '.env' });
const WebhookService = require("./services/WebhookService");
const FiatWalletService = require("./services/FiatWalletService");
const supabase = require("./config/database");

async function runTests() {
  console.log("=== Integration Testing Phase 1 & 2 ===");
  
  // Create a mock transaction
  const ref = "TEST_" + Date.now();
  console.log(`[Test] Setting up mock transaction: ${ref}`);
  
  // Note: this assumes we can insert a dummy user or use an existing one. 
  // We'll try to find an existing user to test with.
  const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
  if (!user) {
    console.error("No user found for testing.");
    return;
  }
  
  const userId = user.id;

  // 1. Insert pending transaction
  const { error: txErr } = await supabase.from('transactions').insert({
    user_id: userId,
    amount: 500,
    currency: 'NGN',
    reference_id: ref,
    status: 'PENDING',
    type: 'DEPOSIT'
  });
  
  if (txErr) {
    console.error("Failed to setup mock transaction:", txErr);
    return;
  }

  // 2. Simulate Webhook
  const mockReq = {
    headers: { 'x-paystack-signature': 'MOCK_SIGNATURE' },
    body: {
      event: 'charge.success',
      data: {
        reference: ref,
        amount: 50000, // kobo
        currency: 'NGN',
        status: 'success',
        id: 12345
      }
    }
  };
  
  const mockRes = {
    status: function(code) {
      this.code = code;
      return this;
    },
    send: function(msg) {
      console.log(`[MockRes] Status: ${this.code}, Msg: ${msg}`);
    }
  };

  // Override signature verification for test
  const origVerify = WebhookService.verifySignature;
  WebhookService.verifySignature = () => true;

  console.log("\n--- Testing Webhook Processing (1st time) ---");
  const startTime = Date.now();
  await WebhookService.processPaystackWebhook(mockReq, mockRes);
  const duration = Date.now() - startTime;
  console.log(`Processing time: ${duration}ms`);

  console.log("\n--- Testing Webhook Duplicate Protection (2nd time) ---");
  await WebhookService.processPaystackWebhook(mockReq, mockRes);

  console.log("\n--- Verifying Wallet Balance ---");
  const wallets = await FiatWalletService.getWallets(userId);
  const ngnWallet = wallets.find(w => w.currency === 'NGN');
  console.log(`NGN Wallet Balance: ${ngnWallet ? ngnWallet.balances.available : 'Not Found'}`);

  console.log("\n--- Verifying Audit Logs ---");
  const { data: audits } = await supabase.from('audit_logs').select('*').eq('reference', ref);
  console.log(`Found ${audits ? audits.length : 0} audit logs.`);
  
  // Cleanup
  WebhookService.verifySignature = origVerify;
  console.log("\n=== Integration Testing Complete ===");
  process.exit(0);
}

runTests();
