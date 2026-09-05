'use strict';

const supabase = require('../config/database');
const walletController = require('../controllers/walletController');

async function testGetLimits() {
  console.log('--- Testing getLimits Controller ---');

  // Fetch a valid user ID from profiles
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, kyc_level')
    .limit(1)
    .single();

  if (error || !profile) {
    console.error('Failed to fetch test profile:', error);
    process.exit(1);
  }

  console.log(`Testing getLimits for user: ${profile.email} (${profile.id})`);

  const req = {
    user: { id: profile.id }
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      console.log(`[Response Status: ${this.statusCode}] Payload:`, JSON.stringify(payload, null, 2));
      if (this.statusCode === 200 && payload.success) {
        console.log('SUCCESS: getLimits returned 200 OK without errors!');
      } else {
        console.error('FAILED: getLimits returned non-200 or failure');
      }
    }
  };

  await walletController.getLimits(req, res, (err) => {
    if (err) console.error('Next called with error:', err);
  });

  process.exit(0);
}

testGetLimits().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
