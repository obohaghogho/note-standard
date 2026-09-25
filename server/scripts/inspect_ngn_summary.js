const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectNgnSummary() {
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('id, user_id, type, status, amount, currency, fee, reference_id, provider, created_at')
    .or('currency.eq.NGN,currency.eq.ngn')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`=== NGN TRANSACTIONS SUMMARY (${txs.length} rows) ===`);
  txs.forEach((t, i) => {
    console.log(`${i+1}. [${t.created_at}] ID:${t.id} Ref:${t.reference_id} Type:${t.type} Status:${t.status} Amt:${t.amount} NGN Fee:${t.fee} Provider:${t.provider}`);
  });
}

inspectNgnSummary();
