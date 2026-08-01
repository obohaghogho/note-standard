const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function testReactionsJoin() {
  console.log("Testing status_reactions join with user:user_id...");
  const res1 = await supabase
    .from('status_reactions')
    .select('emoji, user:user_id (id, full_name, username, avatar_url)')
    .limit(5);

  console.log("Result 1 (joined reactions):", JSON.stringify(res1, null, 2));
}

testReactionsJoin().catch(console.error);
