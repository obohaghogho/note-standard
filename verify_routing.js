
require('dotenv').config({ path: './server/.env' });
const depositService = require('./server/services/depositService');

async function verifyRoutingFix() {
  console.log('--- Verifying Payment Routing Fix ---');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: user } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  
  if (!user) {
    console.error('No user found to test with');
    return;
  }

  const userId = user.id;

  try {
    // 1. Test Card Deposit (USD)
    console.log(`\n1. Testing USD CARD deposit for user ${userId}...`);
    const cardResult = await depositService.createCardDeposit(userId, 'USD', 20);
    console.log('Card Result:', JSON.stringify(cardResult, (k,v) => k === 'url' || k === 'checkoutUrl' || k === 'provider' ? v : undefined, 2));
    
    if (cardResult.checkoutUrl || cardResult.url) {
       console.log('✅ CARD Verification Passed: Checkout URL received.');
    } else {
       console.error('❌ CARD Verification Failed: No checkout URL.');
    }

    // 2. Test Bank Deposit (USD)
    console.log(`\n2. Testing USD BANK_TRANSFER deposit for user ${userId}...`);
    const bankResult = await depositService.createBankDeposit(userId, 'USD', 20);
    console.log('Bank Result:', JSON.stringify(bankResult.bankDetails, null, 2));

    if (bankResult.bankDetails?.bankName === 'Lead Bank') {
       console.log('✅ BANK Verification Passed: Grey details (Lead Bank) received.');
    } else {
       console.error(`❌ BANK Verification Failed: Found ${bankResult.bankDetails?.bankName}`);
    }

  } catch (err) {
    console.error('Verification Error:', err.message);
    if (err.details) console.error('Details:', err.details);
  }
}

verifyRoutingFix();
