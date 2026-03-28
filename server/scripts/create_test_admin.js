require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAdmin() {
  const email = 'audit_admin_final@example.com';
  const password = 'Password123!';
  const username = 'audit_admin_final';

  console.log(`Creating user: ${email}...`);

  // 1. Create user in Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      console.log('User already exists in Auth. Proceeding to elevation...');
      // Get existing user ID
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users.users.find(u => u.email === email);
      if (!user) throw new Error('Could not find existing user');
      await elevateUser(user.id);
    } else {
      console.error('Auth Error:', authError.message);
    }
    return;
  }

  console.log('User created successfully. Elevating to admin...');
  await elevateUser(authData.user.id);
}

async function elevateUser(userId) {
  // 2. Update profile table
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ 
        role: 'admin',
        status: 'active'
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Profile Update Error:', profileError.message);
    return;
  }

  console.log('✓ User promoted to Admin successfully!');
}

createAdmin().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
