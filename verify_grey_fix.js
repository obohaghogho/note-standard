require('dotenv').config({ path: './server/.env' });
const depositService = require('./server/services/depositService');
const math = require('./server/utils/mathUtils');

async function verifyGreyActivation() {
  console.log('--- Verifying Grey Activation ---');
  
  // Use a real userId from your system or a placeholder if running as admin
  // For script testing, we'll try to find any user id from profiles
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: user, error } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  
  if (error || !user) {
    console.error('No user found in database to test with:', error?.message);
    return;
  }

  const userId = user.id;

  try {
    console.log(`Testing USD deposit for user ${userId}...`);
    const usdDeposit = await depositService.createBankDeposit(userId, 'USD', 100);
    
    console.log('USD Result:');
    console.log(JSON.stringify(usdDeposit.bankDetails, null, 2));
    
    if (usdDeposit.bankDetails.bankName === 'Lead Bank') {
      console.log('✅ USD Verification Passed: Lead Bank found.');
    } else {
      console.error(`❌ USD Verification Failed: Found ${usdDeposit.bankDetails.bankName}`);
    }

    console.log('\nTesting EUR deposit...');
    const eurDeposit = await depositService.createBankDeposit(userId, 'EUR', 100);
    
    console.log('EUR Result:');
    console.log(JSON.stringify(eurDeposit.bankDetails, null, 2));
    
    if (eurDeposit.bankDetails.bankName === 'Clear Junction Limited') {
      console.log('✅ EUR Verification Passed: Clear Junction Limited found.');
    } else {
      console.error(`❌ EUR Verification Failed: Found ${eurDeposit.bankDetails.bankName}`);
    }

  } catch (err) {
    console.error('Verification Error:', err.message);
  }
}

verifyGreyActivation();
