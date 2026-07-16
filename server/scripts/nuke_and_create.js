require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupAndCreate() {
  const email = 'audit_admin_final@example.com';
  const password = 'Password123!';
  const username = 'audit_admin_final';

  console.log('--- Cleaning up ---');
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users.users.find(u => u.email === email);
  if (existing) {
    console.log(`Deleting existing user ${existing.id}...`);
    await supabase.auth.admin.deleteUser(existing.id);
  }

  // Delete from profiles too just in case
  await supabase.from('profiles').delete().eq('email', email);

  console.log('--- Creating fresh user ---');
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (authError) throw authError;

  console.log(`User created: ${authData.user.id}. Promoting...`);
  
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ 
        role: 'admin',
        status: 'active'
    })
    .eq('id', authData.user.id);

  if (profileError) {
    // Maybe the profile doesn't exist yet (wait for trigger)
    console.log('Profile update failed, waiting 2s for trigger...');
    await new Promise(r => setTimeout(r, 2000));
    const { error: retryError } = await supabase
      .from('profiles')
      .update({ role: 'admin', status: 'active' })
      .eq('id', authData.user.id);
    if (retryError) throw retryError;
  }

  console.log('✓ SUCCESS: Fresh Admin Created!');
}

cleanupAndCreate().catch(err => console.error(err));
