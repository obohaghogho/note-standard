const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the server directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runResearch() {
  console.log('--- AUDIT: Grey Instructions ---');
  const { data: instructions, error: instError } = await supabase
    .from('grey_instructions')
    .select('*');
  
  if (instError) {
    console.error('Error fetching instructions:', instError.message);
  } else {
    console.table(instructions.map(i => ({
      currency: i.currency,
      bank: i.bank_name,
      acct_name: i.account_name,
      acct_num: i.account_number
    })));
  }

  console.log('\n--- AUDIT: Recent Test Users ---');
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .order('created_at', { ascending: false })
    .limit(5);

  if (profError) {
    console.error('Error fetching profiles:', profError.message);
  } else {
    console.table(profiles);
  }
}

runResearch().catch(err => {
  console.error('Research script failed:', err);
  process.exit(1);
});
