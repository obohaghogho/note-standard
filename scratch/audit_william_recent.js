/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runWilliamRecentIncoming() {
  const williamId = '587b4497-1ab9-4293-b986-d60e0d1422d9';
  const adminId = '5089c266-1ad6-4a83-b23f-064d65995345';

  console.log('=== Recent Messages sent by Admin to William (2026-08-03 and 2026-08-04) ===');
  const { data: messages } = await supabase
    .from('messages')
    .select('id, sender_id, content, created_at, read_at, delivered_at, delivery_status')
    .eq('sender_id', adminId)
    .eq('conversation_id', 'c53fd624-0d9b-4479-a7f5-b064fef186a4')
    .gte('created_at', '2026-08-03T00:00:00Z')
    .order('created_at', { ascending: false });

  console.log(`Found ${messages?.length || 0} messages sent by Admin to William recently.`);

  const msgIds = (messages || []).map(m => m.id);
  const { data: telemetry } = await supabase
    .from('push_delivery_telemetry')
    .select('*')
    .in('message_id', msgIds);

  const telMap = new Map();
  if (telemetry) telemetry.forEach(t => telMap.set(t.message_id, t));

  const tableData = (messages || []).map(m => {
    const t = telMap.get(m.id);
    return {
      message_id: m.id.slice(0, 8),
      time_utc: m.created_at.slice(0, 19).replace('T', ' '),
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
  console.table(tableData);
}

runWilliamRecentIncoming().catch(console.error);
