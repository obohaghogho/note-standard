require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSettings() {
  const { data, error } = await supabase.from('system_settings').select('*').single();
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('System Settings:', JSON.stringify(data, null, 2));
}

checkSettings();
