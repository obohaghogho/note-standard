require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function setupBot() {
  const { data: existingBot } = await supabase.from('profiles').select('id').eq('username', 'note_support_bot').single();
  
  if (existingBot) {
    console.log("Bot already exists with ID:", existingBot.id);
    return;
  }

  const email = `supportbot_${Date.now()}@notestandard.com`;
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: 'SecureBotPassword123!',
    email_confirm: true,
    user_metadata: {
      username: 'note_support_bot',
      full_name: 'Note Standard Support Team'
    }
  });

  if (authErr) {
     console.error("Auth User Error:", authErr.message);
     return;
  }
  
  console.log(authUser.user.id);
}

setupBot().catch(console.error);
