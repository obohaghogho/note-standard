require('dotenv').config({ path: '../../server/.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

// Ensure this isn't run against production
if (!SUPABASE_URL.includes('staging') && !SUPABASE_URL.includes('localhost') && process.env.NODE_ENV !== 'test') {
  console.error("DANGER: You are pointing at what looks like a production database.");
  console.error("Only run this against a staging or local database.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const USER_COUNT = parseInt(process.argv[2], 10) || 100;
const OUTPUT_FILE = path.join(__dirname, '..', 'users.csv');

async function seedUsers() {
  console.log(`Starting to seed ${USER_COUNT} users...`);
  
  // Header for Artillery CSV
  let csvContent = 'user_id,email,password,access_token\n';
  
  for (let i = 0; i < USER_COUNT; i++) {
    const email = `loadtest_user_${Date.now()}_${i}@notestandard.test`;
    const password = 'LoadTestPassword123!';
    
    try {
      // 1. Create User via Admin API
      const { data: adminData, error: adminErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: `LoadTest User ${i}`,
          username: `loadtester_${i}_${Date.now()}`
        }
      });
      
      if (adminErr) {
        console.error(`Error creating user ${i}:`, adminErr.message);
        continue;
      }

      // Wait a moment for trigger to create the profile (if any)
      await new Promise(r => setTimeout(r, 100));
      
      // 2. Sign in to get JWT (Artillery needs the access_token for auth)
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginErr) {
        console.error(`Error logging in user ${i}:`, loginErr.message);
        continue;
      }
      
      // Save to CSV format
      csvContent += `${adminData.user.id},${email},${password},${loginData.session.access_token}\n`;
      
      if ((i + 1) % 10 === 0) {
        console.log(`Created ${i + 1} users...`);
      }
    } catch (err) {
      console.error(`Unexpected error on user ${i}:`, err);
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, csvContent, 'utf8');
  console.log(`\nSuccessfully created users and saved JWTs to ${OUTPUT_FILE}`);
  console.log(`Note: Tokens expire after a certain time based on Supabase project settings.`);
}

seedUsers();
