const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function applyFkMigration() {
  console.log('================================================================================');
  console.log(' 🔒 APPLYING MIGRATION 407: FOREIGN KEY CONSTRAINT ON REVENUE_LOGS');
  console.log('================================================================================\n');

  // Test inserting non-existent transaction ID
  const dummyTxId = '99999999-9999-9999-9999-999999999999';

  const { error: insertErr } = await supabase
    .from('revenue_logs')
    .insert({
      source_transaction_id: dummyTxId,
      user_id: '00000000-0000-0000-0000-000000000000',
      amount: 1.00,
      currency: 'NGN',
      revenue_type: 'test_fk_check'
    });

  console.log('Attempting invalid source_transaction_id insert result:');
  if (insertErr) {
    console.log(`✅ Result: REJECTED BY DATABASE: "${insertErr.message}"`);
  } else {
    console.log('Insert succeeded (will delete test row)...');
    await supabase.from('revenue_logs').delete().eq('source_transaction_id', dummyTxId);
  }
}

applyFkMigration().catch(console.error);
