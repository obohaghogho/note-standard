const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function debugAllRecentMessages() {
  console.log("=== DEBUGGING ALL RECENT MESSAGES IN DB ===");

  const { data: msgs, error: msgErr } = await serviceSupabase
    .from('messages')
    .select('id, conversation_id, content, sender_id, sender_type, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (msgErr) {
    console.error("Error fetching messages:", msgErr);
    return;
  }

  console.log(`Found ${msgs.length} recent messages:`);
  for (const m of msgs) {
    // Get conv info
    const { data: conv } = await serviceSupabase
      .from('conversations')
      .select('id, name, chat_type, support_status')
      .eq('id', m.conversation_id)
      .maybeSingle();

    // Get sender info
    const { data: sender } = await serviceSupabase
      .from('profiles')
      .select('username, plan_tier, role')
      .eq('id', m.sender_id)
      .maybeSingle();

    console.log(`\n[${m.created_at}] Message ID: ${m.id}`);
    console.log(`Conversation: ${m.conversation_id} (type:${conv?.chat_type}, status:${conv?.support_status})`);
    console.log(`Sender: ${sender?.username || m.sender_id} (plan:${sender?.plan_tier}, role:${sender?.role})`);
    console.log(`Content: "${m.content}"`);
  }
}

debugAllRecentMessages().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
