const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRevenueLogsConstraints() {
  console.log('================================================================================');
  console.log(' 🔍 INSPECTING REVENUE_LOGS TABLE CONSTRAINTS & FOREIGN KEYS');
  console.log('================================================================================\n');

  // Test 1: Try inserting a revenue_log with a NON-EXISTENT source_transaction_id
  const dummyTxId = '99999999-9999-9999-9999-999999999999';
  const { error: fkTestErr } = await supabase
    .from('revenue_logs')
    .insert({
      source_transaction_id: dummyTxId,
      user_id: '00000000-0000-0000-0000-000000000000',
      amount: 1.00,
      currency: 'NGN',
      revenue_type: 'test_fk_check'
    });

  if (fkTestErr) {
    console.log(`FK Constraint Test: REJECTED with message: "${fkTestErr.message}"`);
    console.log('✅ Foreign Key constraint exists or RLS/Trigger blocked invalid source_transaction_id!');
  } else {
    console.log('⚠️ Foreign Key constraint NOT present on source_transaction_id (insert succeeded). Cleaning test row...');
    await supabase.from('revenue_logs').delete().eq('source_transaction_id', dummyTxId);
  }
}

inspectRevenueLogsConstraints().catch(console.error);
