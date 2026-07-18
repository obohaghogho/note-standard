require('dotenv').config();
const supabase = require('../server/config/database');

async function run() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, currency, status, metadata, created_at, reference_id')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
