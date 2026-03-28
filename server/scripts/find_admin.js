require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findAdmin() {
  const { data, error } = await supabase
    .from('profiles')
    .select('email, id, role')
    .eq('role', 'admin');

  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('--- Existing Admins ---');
  console.log(JSON.stringify(data, null, 2));
}

findAdmin();
