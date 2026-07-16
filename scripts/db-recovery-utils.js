const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from server/.env");
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function detectOrphans() {
  console.log("🔍 Running Orphan Detection...");
  
  // Detect conversations without members
  const { data: conversations, error: convErr } = await supabase.from('conversations').select('id');
  if (convErr) throw convErr;
  
  const { data: members, error: memErr } = await supabase.from('conversation_members').select('conversation_id');
  if (memErr) throw memErr;

  const activeConvIds = new Set(members.map(m => m.conversation_id));
  const orphans = conversations.filter(c => !activeConvIds.has(c.id));
  
  if (orphans.length > 0) {
    console.warn(`⚠️ Found ${orphans.length} orphaned conversations (no members).`);
  } else {
    console.log("✅ No orphaned conversations found.");
  }
}

async function rebuildUnreadCounts() {
  console.log("🛠️ This utility will rebuild unread counts per user if supported by schema...");
  // Placeholder for advanced unread reconstruction logic
}

async function runRecovery() {
  console.log("=========================================");
  console.log("   INITIATING DATABASE RECOVERY UTILS    ");
  console.log("=========================================");
  try {
    await detectOrphans();
    await rebuildUnreadCounts();
    console.log("✅ Recovery utilities execution complete.");
  } catch (err) {
    console.error("❌ Recovery utilities failed:", err);
  }
}

runRecovery();
