const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const FormData = require('form-data');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = `http://localhost:5002`;
const SG_SECRET = process.env.SENDGRID_INBOUND_PARSE_SECRET;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fullAudit() {
  const testEmail = 'obohoboh107@gmail.com';
  const testPass = 'Moneylove03@';

  console.log('🚀 Starting Full End-to-End Audit for Peter King...');

  // 1. Authenticate
  console.log('\n--- Step 1: Authentication ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPass
  });

  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  const token = authData.session.access_token;
  const userId = authData.user.id;
  console.log('✅ Authenticated successfully. User ID:', userId);

  // 2. Fetch Initial Balance
  console.log('\n--- Step 2: Initial Balance Check ---');
  const { data: wallet, error: walletError } = await supabase
    .from('wallets_store')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'USD')
    .single();

  if (walletError) console.warn('Warning: Wallet not found, will be created during init.');
  const initialBalance = wallet ? wallet.balance : 0;
  console.log('💰 Initial USD Balance:', initialBalance);

  // 3. Request Instructions
  console.log('\n--- Step 3: Fetching Bank Instructions ---');
  const instRes = await axios.get(`${API_URL}/api/payment/instructions/USD`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('🏦 Received Instructions:', {
    bank: instRes.data.bank_name,
    acct: instRes.data.account_number,
    instructions: instRes.data.instructions
  });

  if (instRes.data.bank_name !== 'Lead Bank') {
    throw new Error(`Audit FAILED: Expected Lead Bank but got ${instRes.data.bank_name}`);
  }

  // 4. Initialize Payment
  console.log('\n--- Step 4: Initializing Deposit (USD 10.00) ---');
  const initRes = await axios.post(`${API_URL}/api/payment/initialize`, {
    amount: 10,
    currency: 'USD',
    provider: 'grey'
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const txReference = initRes.data.reference;
  const noteReference = initRes.data.provider_reference; // e.g., NOTE-123456
  
  if (!noteReference) {
    throw new Error('Audit FAILED: No provider_reference (NOTE-XXXXXX) returned in initialization.');
  }

  console.log('📝 Transaction Initialized. Internal Reference:', txReference);
  console.log('🔍 Matching Reference for Webhook (Narration):', noteReference);

  // 5. Simulate SendGrid Inbound Webhook
  console.log('\n--- Step 5: Simulating SendGrid Inbound Parse Webhook ---');
  const form = new FormData();
  form.append('from', 'noreply@grey.co');
  form.append('subject', 'Payment Received Notification');
  form.append('text', `Hello Peter King, we received your payment associated with reference ${noteReference}. The amount was $10.00 USD.`);
  form.append('to', 'parsing@yourdomain.com');

  try {
    const webhookRes = await axios.post(`${API_URL}/api/payment/sendgrid-inbound?secret=${SG_SECRET}`, form, {
      headers: { ...form.getHeaders() }
    });
    console.log('📡 Webhook POST response:', webhookRes.status, webhookRes.data);
  } catch (err) {
    console.error('Webhook Simulation Error:', err.response?.data || err.message);
    throw err;
  }

  // 6. Polling for Completion
  console.log('\n--- Step 6: Polling for Transaction Completion ---');
  let completed = false;
  for (let i = 0; i < 15; i++) { // Increased poll attempts
    console.log(`Checking status (attempt ${i + 1}/15)...`);
    const statusRes = await axios.get(`${API_URL}/api/payment/status/${txReference}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Current Status:', statusRes.data.status);
    if (statusRes.data.status === 'COMPLETED' || statusRes.data.status === 'success') {
      completed = true;
      break;
    }
    await new Promise(r => setTimeout(r, 3000)); // Wait for worker
  }

  if (!completed) {
    throw new Error('Audit FAILED: Transaction did not complete within the timeout.');
  }

  // 7. Final Balance Check
  console.log('\n--- Step 7: Final Balance Check ---');
  const { data: finalWallet } = await supabase
    .from('wallets_store')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'USD')
    .single();

  console.log('💰 Final USD Balance:', finalWallet.balance);
  const delta = finalWallet.balance - initialBalance;
  console.log('📈 Balance Increase:', delta);

  if (delta >= 10) {
    console.log('\n✅ AUDIT SUCCESSFUL: The Grey transfer flow is working perfectly.');
  } else {
    throw new Error(`Audit FAILED: Balance increase (${delta}) is less than expected (10).`);
  }
}

fullAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err.message);
  process.exit(1);
});
