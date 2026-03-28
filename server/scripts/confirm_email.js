require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function confirmEmail() {
  const userId = '0573be74-5bd6-4a83-b23f-064d65995345';
  console.log(`Confirming email for user ${userId}...`);

  const { data, error } = await supabase.auth.admin.updateUserById(
    userId,
    { email_confirm: true }
  );

  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('✓ Email confirmed successfully!');
}

confirmEmail();
