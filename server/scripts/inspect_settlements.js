const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSettlementsTable() {
  const { data, error } = await supabase.from('settlements').select('*').limit(1);
  if (error) console.log('settlements query error:', error.message);
  else console.log('settlements sample:', data);
}

inspectSettlementsTable().catch(console.error);
