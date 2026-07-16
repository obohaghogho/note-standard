require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUser() {
  const userId = '0573be74-5bd6-4a83-b23f-064d65995345';
  console.log(`Checking user ${userId}...`);

  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('User found:', JSON.stringify(data.user, null, 2));
}

checkUser();
