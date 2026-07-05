const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const messageId = process.argv[2];
  if (!messageId) {
    console.error("Usage: node trace_notification.js <messageId>");
    process.exit(1);
  }

  console.log(`\n=== TRACE FOR MESSAGE: ${messageId} ===\n`);

  // 1. Message created
  const { data: message } = await supabase.from('messages').select('*').eq('id', messageId).single();
  if (message) {
    console.log(`[1] MESSAGE CREATED:`);
    console.log(`    Sender: ${message.sender_id}`);
    console.log(`    Conversation: ${message.conversation_id}`);
    console.log(`    Content: "${message.content?.substring(0, 50)}..."`);
    console.log(`    Created at: ${message.created_at}`);
  } else {
    console.log(`[1] MESSAGE: Not found in database (or it's a typing indicator / call signal)`);
  }

  // 2. Telemetry / Routing
  const { data: telemetry } = await supabase.from('push_delivery_telemetry').select('*').eq('message_id', messageId);
  if (telemetry && telemetry.length > 0) {
    console.log(`\n[2] ROUTING DECISIONS (${telemetry.length} records):`);
    telemetry.forEach((t, index) => {
      console.log(`\n    --- Event ${index + 1} ---`);
      console.log(`    Recipient: ${t.recipient_id}`);
      console.log(`    Engine: ${t.routing_engine_version} | Decision: ${t.routing_decision}`);
      if (t.suppression_reason) console.log(`    Suppression Reason: ${t.suppression_reason}`);
      console.log(`    Fallback Used: ${t.fallback_used}`);
      console.log(`    Active Sockets: ${t.active_socket_count}`);
      console.log(`    Installations Evaluated: ${t.installation_count}`);
      console.log(`    Endpoints Valid: ${t.endpoint_count}`);
      
      if (t.resolved_installations && t.resolved_installations.length > 0) {
        console.log(`    Resolved Installations:`);
        t.resolved_installations.forEach(inst => {
          console.log(`      - ID: ${inst.id} | State: ${inst.state}`);
        });
      }
    });
  } else {
    console.log(`\n[2] ROUTING DECISIONS: No telemetry found for this messageId.`);
  }

  // 3. Delivery ACKs (Message Status)
  const { data: status } = await supabase.from('message_status').select('*').eq('message_id', messageId);
  if (status && status.length > 0) {
    console.log(`\n[3] DELIVERY STATUS:`);
    status.forEach(s => {
      console.log(`    User ${s.user_id}:`);
      console.log(`      Delivered: ${s.is_delivered ? 'YES at ' + s.delivered_at : 'NO'}`);
      console.log(`      Read:      ${s.is_read ? 'YES at ' + s.read_at : 'NO'}`);
    });
  } else {
    console.log(`\n[3] DELIVERY STATUS: No status records found.`);
  }
}

run().catch(console.error);
