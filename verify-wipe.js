require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalVerification() {
  try {
    const { count: entriesCount } = await supabase.from('ledger_entries_v6').select('*', { count: 'exact', head: true });
    const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
    const { count: walletsCount } = await supabase.from('wallets_v6').select('*', { count: 'exact', head: true });

    console.log(`LEDGER_ENTRIES_V6 COUNT: ${entriesCount}`);
    console.log(`TRANSACTIONS COUNT: ${txCount}`);
    console.log(`WALLETS_V6 COUNT: ${walletsCount}`);

    if (walletsCount > 0) {
      const { data: samples } = await supabase.from('wallets_v6').select('user_id, balance, currency').limit(5);
      console.log('SURVIVING WALLETS:', samples);
    }
  } catch (err) {
    console.error(err);
  }
}

finalVerification();
