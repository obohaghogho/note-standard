const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRevenueIdempotency() {
  console.log('================================================================================');
  console.log(' 🧪 TESTING REVENUE LOG IDEMPOTENCY (DUPLICATE PREVENTION)');
  console.log('================================================================================\n');

  // Find a valid completed transaction
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, amount, currency, status')
    .eq('status', 'COMPLETED')
    .limit(1)
    .single();

  if (!tx) {
    console.error('No completed transaction found for test.');
    return;
  }

  console.log(`Target Transaction: ID=${tx.id}, Amount=${tx.amount} ${tx.currency}, Status=${tx.status}`);

  // Count existing revenue_logs before test
  const { count: countBefore } = await supabase
    .from('revenue_logs')
    .select('*', { count: 'exact', head: true })
    .eq('source_transaction_id', tx.id);

  console.log(`Existing revenue_logs count for tx ${tx.id}: ${countBefore}`);

  // Execution 1: Attempt insertion
  const { error: err1 } = await supabase
    .from('revenue_logs')
    .insert({
      source_transaction_id: tx.id,
      user_id: '00000000-0000-0000-0000-000000000000',
      amount: 1.23,
      currency: tx.currency,
      revenue_type: 'idempotency_test'
    });

  if (err1 && err1.message.includes('unique constraint')) {
    console.log(`Execution 1 Result: Blocked by unique constraint (already logged). Message: "${err1.message}"`);
  } else if (!err1) {
    console.log('Execution 1 Result: Inserted first log.');
  } else {
    console.log(`Execution 1 Result: Error: ${err1.message}`);
  }

  // Execution 2: Attempt duplicate insertion
  const { error: err2 } = await supabase
    .from('revenue_logs')
    .insert({
      source_transaction_id: tx.id,
      user_id: '00000000-0000-0000-0000-000000000000',
      amount: 1.23,
      currency: tx.currency,
      revenue_type: 'idempotency_test'
    });

  console.log('\nExecution 2 Result:');
  if (err2 && (err2.message.includes('unique constraint') || err2.message.includes('duplicate key'))) {
    console.log(`✅ PERFECT IDEMPOTENCY: Duplicate insert rejected by DB UNIQUE constraint! ("${err2.message}")`);
  } else {
    console.log('Warning: Duplicate insert result:', err2 ? err2.message : 'Inserted (duplicate)');
  }

  // Final Count
  const { count: countAfter } = await supabase
    .from('revenue_logs')
    .select('*', { count: 'exact', head: true })
    .eq('source_transaction_id', tx.id);

  console.log(`\nFinal revenue_logs count for tx ${tx.id}: ${countAfter}`);
  console.log(`Idempotency Check: ${countAfter === 1 ? '✅ PASS (Exactly 1 record)' : '❌ FAIL'}`);
}

testRevenueIdempotency().catch(console.error);
