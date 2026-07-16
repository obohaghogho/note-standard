require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listUsers() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('--- Users List ---');
  data.users.forEach(u => {
    console.log(`Email: ${u.email}, ID: ${u.id}`);
  });
}

listUsers();
