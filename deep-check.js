require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepCheck() {
  try {
    const { data: storeSamples } = await supabase.from('wallets_store').select('*').limit(5);
    console.log('WALLETS_STORE SAMPLES:', storeSamples);
    
    // Attempt to delete from wallets_store as well?
    // Usually wallets_store only has addresses, but let's check.
  } catch (err) {
    console.error(err);
  }
}

deepCheck();
