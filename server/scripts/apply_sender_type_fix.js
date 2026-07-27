const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fixSenderTypeColumn() {
  console.log("=== CHECKING & FIXING SENDER_TYPE COLUMN IN MESSAGES TABLE ===");

  // 1. Try selecting sender_type to see if it exists
  const { error: checkErr } = await serviceSupabase
    .from('messages')
    .select('sender_type')
    .limit(1);

  if (checkErr && checkErr.code === '42703') {
    console.log("Column sender_type is missing! Adding sender_type column...");
    
    // Run SQL execution via RPC or direct SQL if rpc_exec_sql exists, or via standard column creation
    const { error: rpcErr } = await serviceSupabase.rpc('rpc_exec_sql', {
      sql_query: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type text DEFAULT 'user';"
    });

    if (rpcErr) {
      console.warn("rpc_exec_sql failed:", rpcErr.message, "- trying direct RPC or raw migration");
    } else {
      console.log("✅ Successfully added sender_type column via rpc_exec_sql!");
    }
  } else if (!checkErr) {
    console.log("✅ Column sender_type already exists!");
  } else {
    console.warn("Other check error:", checkErr);
  }
}

fixSenderTypeColumn().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
