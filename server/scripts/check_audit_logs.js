const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLogs() {
  console.log('--- AUDIT: Webhook Logs (Latest) ---');
  const { data: logs, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) console.error(error);
  else console.log(JSON.stringify(logs, null, 2));

  console.log('\n--- AUDIT: Payment Records (Latest) ---');
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log(JSON.stringify(payments, null, 2));

  console.log('\n--- AUDIT: Transaction Records (Latest) ---');
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log(JSON.stringify(txs, null, 2));
}

checkLogs();
