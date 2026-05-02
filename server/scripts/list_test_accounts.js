require('dotenv').config({ path: __dirname + '/../.env' });
const supabase = require('../config/database');

async function listTestAccounts() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .or('email.ilike.%test%,email.ilike.%example.com%,username.ilike.%test%');


  if (error) {
    console.error('Error fetching test accounts:', error);
    return;
  }

  console.log(`Found ${profiles.length} potential test accounts:`);
  profiles.forEach(p => {
    console.log(`- ID: ${p.id} | Email: ${p.email} | Username: ${p.username} | Name: ${p.full_name}`);
  });
}

listTestAccounts();
