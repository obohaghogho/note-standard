require('dotenv').config({ path: __dirname + '/../.env' });
const supabase = require('../config/database');

async function deleteTestAccounts() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .or('email.ilike.%test%,email.ilike.%example.com%,username.ilike.%test%');

  if (error) {
    console.error('Error fetching test accounts:', error);
    return;
  }

  console.log(`Found ${profiles.length} test accounts to delete.`);

  for (const p of profiles) {
    console.log(`Deleting user: ${p.email} (${p.id})...`);
    
    // First, optionally delete the profile if there's no cascade
    // We will attempt to delete via Supabase Admin API which removes them from auth.users
    const { data, error: deleteError } = await supabase.auth.admin.deleteUser(p.id);
    
    if (deleteError) {
      console.error(`Failed to delete ${p.email}:`, deleteError.message);
      
      // Fallback: Just delete the profile and let the DB trigger handle it if applicable
      // But auth.users deletion is usually restricted to Admin API.
      // If it fails because of foreign keys, we might need to delete profiles first.
      console.log(`Attempting to delete profile instead for ${p.email}...`);
      await supabase.from('profiles').delete().eq('id', p.id);
    } else {
      console.log(`Successfully deleted ${p.email} from auth.users.`);
    }
  }

  console.log('Cleanup complete.');
}

deleteTestAccounts();
