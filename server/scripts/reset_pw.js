require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetPassword() {
  const userId = '0573be74-5bd6-4a83-b23f-064d65995345';
  console.log(`Resetting password for user ${userId}...`);

  const { data, error } = await supabase.auth.admin.updateUserById(
    userId,
    { password: 'Password123!' }
  );

  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('✓ Password reset successful!');
}

resetPassword();
