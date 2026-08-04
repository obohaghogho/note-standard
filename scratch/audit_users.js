/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runAudit() {
  console.log('=== STEP 1: Finding profiles for William and Admin ===');
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, full_name, email, role, created_at');

  if (pErr) {
    console.error('Error fetching profiles:', pErr);
    return;
  }

  console.log(`Found ${profiles.length} total profiles.`);
  
  const williamProfiles = profiles.filter(p => 
    (p.username && p.username.toLowerCase().includes('william')) ||
    (p.full_name && p.full_name.toLowerCase().includes('william')) ||
    (p.email && p.email.toLowerCase().includes('william'))
  );

  const adminProfiles = profiles.filter(p => 
    (p.username && p.username.toLowerCase().includes('admin')) ||
    (p.full_name && p.full_name.toLowerCase().includes('admin')) ||
    (p.email && p.email.toLowerCase().includes('admin')) ||
    (p.role && p.role.toLowerCase().includes('admin'))
  );

  console.log('\n--- William Profiles ---');
  console.table(williamProfiles);

  console.log('\n--- Admin Profiles ---');
  console.table(adminProfiles);

  const williamIds = williamProfiles.map(p => p.id);
  const adminIds = adminProfiles.map(p => p.id);

  console.log('\n=== STEP 2: Checking Push Subscriptions ===');
  const { data: williamSubs, error: wsErr } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', williamIds);
  console.log('William Subscriptions:', williamSubs);

  const { data: adminSubs, error: asErr } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', adminIds);
  console.log('Admin Subscriptions:', adminSubs);

  console.log('\n=== STEP 3: Checking Device Installations (V2 Routing) ===');
  const { data: williamInstalls } = await supabase
    .from('device_installations')
    .select('*')
    .in('user_id', williamIds);
  console.log('William Device Installations:', williamInstalls);

  const { data: adminInstalls } = await supabase
    .from('device_installations')
    .select('*')
    .in('user_id', adminIds);
  console.log('Admin Device Installations:', adminInstalls);

  console.log('\n=== STEP 4: Messages / Notifications from William to Admin ===');
  // Check notifications table
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .in('user_id', adminIds)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log(`Recent notifications for Admin (${notifications?.length || 0}):`, notifications);

  // Check messages table sent by William
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .in('sender_id', williamIds)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log(`Messages sent by William (${messages?.length || 0}):`, messages);

  console.log('\n=== STEP 5: Push Delivery Metrics & Telemetry for Admin ===');
  const { data: adminPushMetrics } = await supabase
    .from('push_metrics')
    .select('*')
    .in('user_id', adminIds)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('Push metrics for Admin:', adminPushMetrics);

  const { data: telemetry } = await supabase
    .from('push_delivery_telemetry')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  console.log(`Push delivery telemetry (latest 50):`, telemetry);
}

runAudit().catch(console.error);
