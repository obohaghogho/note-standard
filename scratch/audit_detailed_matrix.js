/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runDetailedAudit() {
  const williamId = '587b4497-1ab9-4293-b986-d60e0d1422d9';
  const adminId = '5089c266-1ad6-4a83-b23f-064d65995345';

  // Fetch messages from William today
  const { data: messages } = await supabase
    .from('messages')
    .select('id, content, created_at, read_at, delivered_at, delivery_status')
    .eq('sender_id', williamId)
    .gte('created_at', '2026-08-04T00:00:00Z')
    .order('created_at', { ascending: true });

  const msgIds = messages.map(m => m.id);

  // Fetch telemetry for these messages
  const { data: telemetry } = await supabase
    .from('push_delivery_telemetry')
    .select('*')
    .in('message_id', msgIds);

  const telMap = new Map();
  if (telemetry) {
    telemetry.forEach(t => telMap.set(t.message_id, t));
  }

  // Also fetch push_metrics for recipient adminId today
  const { data: metrics } = await supabase
    .from('push_metrics')
    .select('*')
    .eq('user_id', adminId)
    .gte('created_at', '2026-08-04T00:00:00Z');

  console.log('=== Detailed Message vs Push Audit (William -> Admin) Today (2026-08-04) ===\n');

  const reportData = messages.map(m => {
    const t = telMap.get(m.id);
    return {
      message_id: m.id.slice(0, 8),
      time_utc: m.created_at.slice(11, 19),
      content: m.content.length > 25 ? m.content.slice(0, 22) + '...' : m.content,
      read_at: m.read_at ? m.read_at.slice(11, 19) : 'unread',
      delivered_at: m.delivered_at ? m.delivered_at.slice(11, 19) : 'none',
      socket_present: t ? t.socket_present : 'N/A',
      routing_decision: t ? t.routing_decision : 'N/A',
      push_sent: t ? t.push_sent : 'N/A',
      provider_result: t ? t.provider_result : 'N/A',
      delivery_ack: t ? t.delivery_ack_received : 'N/A',
      ack_latency_ms: t ? t.ack_latency_ms : 'N/A'
    };
  });

  console.table(reportData);

  console.log('\n=== Summary Metrics Today ===');
  console.log(`Total messages sent by William today: ${messages.length}`);
  console.log(`Push notifications sent (PUSH_IMMEDIATE): ${reportData.filter(r => r.push_sent === true).length}`);
  console.log(`Pushes suppressed due to active WebSocket (SOCKET_FIRST): ${reportData.filter(r => r.routing_decision === 'SOCKET_FIRST').length}`);
  console.log(`Total push delivery ACKs received by recipient (Admin): ${reportData.filter(r => r.delivery_ack === true).length}`);
}

runDetailedAudit().catch(console.error);
