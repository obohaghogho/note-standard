/**
 * verify_db_state.js
 *
 * PostgreSQL Database State Inspector.
 * Inspects `messages` and database tables with retry logic for network resilience.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { 'x-client-info': 'note-standard-audit' } }
});

async function inspectMessageState(messageIdOrEventId) {
  console.log(`\n=================================================================`);
  console.log(` 🗄️  DATABASE STATE INSPECTOR | Message ID / Event ID: ${messageIdOrEventId}`);
  console.log(`=================================================================\n`);

  let query = supabase.from('messages').select('*');
  
  if (messageIdOrEventId.includes('-') && messageIdOrEventId.length > 20) {
    query = query.or(`id.eq.${messageIdOrEventId},event_id.eq.${messageIdOrEventId}`);
  } else {
    query = query.eq('id', messageIdOrEventId);
  }

  let messages = null;
  let error = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await query;
      messages = res.data;
      error = res.error;
      if (!error) break;
    } catch (e) {
      error = e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (error) {
    console.error("❌ Database query error:", error.message || error);
    return;
  }

  if (!messages || messages.length === 0) {
    console.warn(`⚠️  No message found with ID or Event ID: ${messageIdOrEventId}`);
    return;
  }

  const msg = messages[0];
  console.log(`Message Details:`);
  console.log(`  - ID           : ${msg.id}`);
  console.log(`  - Event ID     : ${msg.event_id || 'N/A'}`);
  console.log(`  - Conversation : ${msg.conversation_id}`);
  console.log(`  - Sender ID    : ${msg.sender_id}`);
  console.log(`  - Content      : "${msg.content}"`);
  console.log(`  - Created At   : ${msg.created_at}`);
  console.log(`  - Delivered At : ${msg.delivered_at ? `✅ ${msg.delivered_at}` : '❌ NULL (NOT DELIVERED)'}`);
  console.log(`  - Read At      : ${msg.read_at ? `✅ ${msg.read_at}` : '❌ NULL (UNREAD)'}`);

  console.log(`\n=================================================================\n`);
}

async function inspectRecentMessages() {
  console.log(`\n=================================================================`);
  console.log(` 🗄️  RECENT MESSAGES DATABASE STATE (LAST 10 MESSAGES)`);
  console.log(`=================================================================\n`);

  let messages = null;
  let error = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await supabase
        .from('messages')
        .select('id, event_id, conversation_id, sender_id, created_at, delivered_at, read_at, content')
        .order('created_at', { ascending: false })
        .limit(10);
      messages = res.data;
      error = res.error;
      if (!error && messages) break;
    } catch (e) {
      error = e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (error) {
    console.error("❌ Error fetching recent messages:", error.message || error);
    return;
  }

  console.table(messages.map(m => ({
    id: m.id.slice(0, 8) + '...',
    event_id: m.event_id ? m.event_id.slice(0, 8) + '...' : 'N/A',
    sender: m.sender_id.slice(0, 8) + '...',
    created: m.created_at,
    delivered: m.delivered_at ? '✅ YES' : '❌ NO',
    read: m.read_at ? '✅ YES' : '❌ NO',
    content: m.content ? (m.content.length > 20 ? m.content.slice(0, 20) + '...' : m.content) : ''
  })));

  console.log(`\n=================================================================\n`);
}

const targetArg = process.argv[2];
if (targetArg) {
  inspectMessageState(targetArg).catch(console.error);
} else {
  inspectRecentMessages().catch(console.error);
}
