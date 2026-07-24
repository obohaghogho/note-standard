require('dotenv').config();
const supabase = require('../server/config/database');

async function run() {
  const { data, error } = await supabase
    .from('payment_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log("Audit Logs:", JSON.stringify(data, null, 2));
}
run();
