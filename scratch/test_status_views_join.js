const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function testJoin() {
  console.log("Testing status_views join with viewer:viewer_id...");
  const res1 = await supabase
    .from('status_views')
    .select('viewed_at, completed, viewer:viewer_id (id, full_name, username, avatar_url)')
    .limit(5);

  console.log("Result 1 (joined):", JSON.stringify(res1, null, 2));

  console.log("\nTesting status_views raw query...");
  const res2 = await supabase
    .from('status_views')
    .select('status_id, viewer_id, viewed_at, completed')
    .limit(5);

  console.log("Result 2 (raw):", JSON.stringify(res2, null, 2));
}

testJoin().catch(console.error);
