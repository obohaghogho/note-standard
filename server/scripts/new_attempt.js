require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createNewAttempt() {
  const email = 'audit_tester_new@notestandard.com';
  const password = 'Password123!';
  const username = 'audit_tester';

  console.log(`Creating user: ${email}...`);

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (authError) throw authError;

  console.log('User created. Promoting...');
  
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'admin', status: 'active' })
    .eq('id', authData.user.id);

  if (profileError) {
    console.log('Waiting for profile trigger...');
    await new Promise(r => setTimeout(r, 3000));
    const { error: retryError } = await supabase
      .from('profiles')
      .update({ role: 'admin', status: 'active' })
      .eq('id', authData.user.id);
    if (retryError) throw retryError;
  }

  console.log('✓ Success!');
}

createNewAttempt().catch(err => console.error(err));
