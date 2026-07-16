require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSubs() {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) console.error('Error:', error);
  console.log('Subscriptions:', data);
}

checkSubs();
