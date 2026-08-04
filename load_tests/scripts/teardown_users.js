const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../server/.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

// Ensure this isn't run against production
if (!SUPABASE_URL.includes('staging') && !SUPABASE_URL.includes('localhost') && process.env.NODE_ENV !== 'test') {
  console.error("DANGER: You are pointing at what looks like a production database.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const CSV_FILE = path.join(__dirname, '..', 'users.csv');

async function teardownUsers() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`File ${CSV_FILE} not found. Cannot teardown without user IDs.`);
    return;
  }

  const content = fs.readFileSync(CSV_FILE, 'utf8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  // Skip header
  const users = lines.slice(1).map(line => {
    const parts = line.split(',');
    return { id: parts[0], email: parts[1] };
  });

  console.log(`Found ${users.length} users to delete...`);

  let deletedCount = 0;
  for (const user of users) {
    if (!user.id) continue;
    
    // The profiles table relies on ON DELETE CASCADE, so deleting the auth.users record will delete the profile.
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`Failed to delete user ${user.id} (${user.email}):`, error.message);
    } else {
      deletedCount++;
      if (deletedCount % 10 === 0) {
        console.log(`Deleted ${deletedCount} users...`);
      }
    }
  }

  console.log(`\nSuccessfully deleted ${deletedCount} users.`);
  fs.unlinkSync(CSV_FILE);
  console.log(`Removed ${CSV_FILE}`);
}

teardownUsers();
