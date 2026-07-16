require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function apply() {
  const { data, error } = await supabase.from('profiles').insert([{
    id: '00000000-0000-0000-0000-000000000000',
    username: 'support_bot',
    full_name: 'Note Standard Support Team',
    email: 'support@notestandard.com',
    is_verified: true,
    plan_tier: 'admin'
  }]).select();
  
  if (error) {
     if (error.code === '23505') console.log("Profile already exists.");
     else console.error(error);
  } else {
     console.log("Successfully inserted bot profile:", data);
  }
}
apply();
