
require('dotenv').config({ path: './server/.env' });
const depositService = require('./server/services/depositService');

async function verifyBankRouting() {
  console.log('--- Verifying Bank Routing ---');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: user } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  
  if (!user) {
    console.error('No user found to test with');
    return;
  }

  const userId = user.id;

  try {
    console.log(`\nTesting USD BANK_TRANSFER deposit for user ${userId}...`);
    const bankResult = await depositService.createBankDeposit(userId, 'USD', 20);
    console.log('Bank Result:', JSON.stringify(bankResult.bankDetails, null, 2));

    if (bankResult.bankDetails?.bankName === 'Lead Bank') {
       console.log('✅ BANK Verification Passed: Grey details (Lead Bank) received.');
    } else {
       console.error(`❌ BANK Verification Failed: Found ${bankResult.bankDetails?.bankName}`);
    }

  } catch (err) {
    console.error('Verification Error:', err.message);
  }
}

verifyBankRouting();
