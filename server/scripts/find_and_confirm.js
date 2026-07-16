require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findAndConfirm() {
  const email = 'audit_admin_final@example.com';
  console.log(`Searching for user: ${email}...`);

  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;

  const user = users.find(u => u.email === email);
  if (!user) {
    console.log('User not found. Re-creating...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: 'Password123!',
        email_confirm: true,
        user_metadata: { username: 'audit_admin_final' }
    });
    if (createError) throw createError;
    console.log(`User created: ${newUser.user.id}`);
    return;
  }

  console.log(`Found user: ${user.id}. Confirming email and resetting password...`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { 
        email_confirm: true,
        password: 'Password123!'
    }
  );

  if (updateError) throw updateError;
  console.log('✓ Success!');
}

findAndConfirm().catch(err => console.error(err));
