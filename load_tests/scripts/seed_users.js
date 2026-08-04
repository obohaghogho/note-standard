const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../server/.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const jwt = require('jsonwebtoken');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or JWT_SECRET in environment variables.");
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
  fs.writeFileSync(OUTPUT_FILE, 'user_id,email,password,access_token\n', 'utf8');
  
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
        if (adminErr.message.includes('rate limit')) {
           console.error('Admin API rate limit reached, pausing for 2 seconds...');
           await new Promise(r => setTimeout(r, 2000));
           i--; // retry this user
           continue;
        }
        console.error(`Error creating user ${i}:`, adminErr.message);
        continue;
      }

      // 2. Create JWT token manually to bypass signIn rate limits
      const userId = adminData.user.id;
      const token = jwt.sign(
        { 
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24 hours
          sub: userId,
          email: email,
          role: 'authenticated'
        },
        JWT_SECRET
      );
      
      // Append to CSV format immediately
      fs.appendFileSync(OUTPUT_FILE, `${userId},${email},${password},${token}\n`, 'utf8');
      
      if ((i + 1) % 10 === 0) {
        console.log(`Created ${i + 1} users...`);
      }
    } catch (err) {
      console.error(`Unexpected error on user ${i}:`, err);
    }
  }
  
  console.log(`\nSuccessfully created users and saved JWTs to ${OUTPUT_FILE}`);
}

seedUsers();
