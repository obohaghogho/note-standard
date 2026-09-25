const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanTestLogs() {
  console.log('Cleaning up idempotency_test rows...');
  const { data, error } = await supabase
    .from('revenue_logs')
    .delete()
    .eq('revenue_type', 'idempotency_test');
  
  if (error) console.error('Error deleting test rows:', error);
  else console.log('✅ Cleaned up idempotency_test rows.');
}

cleanTestLogs().catch(console.error);
