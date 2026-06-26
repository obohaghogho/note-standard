require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMetrics() {
  const { data, error } = await supabase
    .from('push_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) console.error('Error:', error);
  console.log('Recent push metrics:', data);
}

checkMetrics();
