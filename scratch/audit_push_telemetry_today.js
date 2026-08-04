/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTodayPushTelemetry() {
  const adminId = '5089c266-1ad6-4a83-b23f-064d65995345';
  const williamId = '587b4497-1ab9-4293-b986-d60e0d1422d9';

  console.log('=== Checking Push Delivery Telemetry for Admin Today ===');
  const { data: telemetry, error: tErr } = await supabase
    .from('push_delivery_telemetry')
    .select('*')
    .eq('recipient_id', adminId)
    .gte('created_at', '2026-08-04T00:00:00Z')
    .order('created_at', { ascending: false });

  if (tErr) console.error('Telemetry Error:', tErr);
  console.log(`Telemetry entries for Admin today (${telemetry?.length || 0}):`, telemetry);

  console.log('\n=== Checking Push Metrics for Admin Today ===');
  const { data: metrics, error: mErr } = await supabase
    .from('push_metrics')
    .select('*')
    .eq('user_id', adminId)
    .gte('created_at', '2026-08-04T00:00:00Z')
    .order('created_at', { ascending: false });

  if (mErr) console.error('Metrics Error:', mErr);
  console.log(`Push metrics entries for Admin today (${metrics?.length || 0}):`, metrics);

  console.log('\n=== Checking All Push Metrics for Admin (all time, latest 20) ===');
  const { data: allMetrics } = await supabase
    .from('push_metrics')
    .select('*')
    .eq('user_id', adminId)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`All push metrics for Admin (latest 20):`, allMetrics);

  console.log('\n=== Checking All Telemetry for Admin (all time, latest 20) ===');
  const { data: allTel } = await supabase
    .from('push_delivery_telemetry')
    .select('*')
    .eq('recipient_id', adminId)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`All telemetry for Admin (latest 20):`, allTel);
}

checkTodayPushTelemetry().catch(console.error);
